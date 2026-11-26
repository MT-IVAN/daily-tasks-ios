import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import { redis, Task, getTodayTasksKey, TASKS_TTL_SECONDS } from '@/lib/redis'

const ai = new GoogleGenAI()

// Lista ordenada por prioridad: si el primero devuelve 503 o 429, pasa al siguiente
const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
]

async function generateTasksWithFallback(prompt: string) {
  let lastError: unknown

  for (const model of FALLBACK_MODELS) {
    try {
      return await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            description: 'Lista actualizada de tareas del día',
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
                done: { type: Type.BOOLEAN },
              },
              required: ['id', 'text', 'done'],
            },
          },
        },
      })
    } catch (error: any) {
      lastError = error
      const status = error?.status || error?.code
      // Solo hacemos fallback si es sobrecarga (503) o rate limit (429)
      if (status === 503 || status === 429) {
        console.warn(
          `Modelo ${model} saturado (${status}), intentando fallback...`,
        )
        continue
      }
      throw error
    }
  }

  throw lastError
}

export async function GET() {
  const tasks = (await redis.get<Task[]>(getTodayTasksKey())) || []
  return NextResponse.json({ tasks })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    if (body.update_id && !body.message?.text) {
      return NextResponse.json({ ok: true })
    }
    if (
      body.message &&
      String(body.message.chat.id) !== process.env.MY_CHAT_ID
    ) {
      return NextResponse.json({ ok: true }) // Ignora mensajes de otros usuarios
    }
    const userPrompt: string | undefined = body.prompt || body.message?.text

    if (!userPrompt) {
      return NextResponse.json({ error: 'Falta el texto' }, { status: 400 })
    }

    const key = getTodayTasksKey()
    const currentTasks = (await redis.get<Task[]>(key)) || []

    const instruction = `
      Estado actual de tareas de hoy (JSON): ${JSON.stringify(currentTasks)}
      Instrucción del usuario: "${userPrompt}"
      
      Reglas estrictas para actualizar el JSON:
      1. AGREGAR TAREAS: Si el usuario pide agregar una actividad (ej. "agrega ir al gym"), SIEMPRE crea un nuevo objeto con un id único nuevo y "done": false, INCLUSO SI ya existe otra tarea con el mismo nombre marcada como "done": true. Nunca omitas una tarea nueva solo porque ya se completó una igual antes.
      2. COMPLETAR TAREAS: Si el usuario dice que ya hizo o completó algo, busca una tarea pendiente ("done": false) que coincida y cámbiala a "done": true. No modifiques tareas que ya estén en "done": true.
      3. BORRAR / LIMPIAR: Si pide eliminar una tarea específica o limpiar todo el día, elimínala o devuelve [].
      4. Conserva intactos los "id", "text" y "done" de las demás tareas existentes.
    `

    const response = await generateTasksWithFallback(instruction)
    const updatedTasks: Task[] = JSON.parse(response.text || '[]')
    await redis.set(getTodayTasksKey(), updatedTasks, { ex: TASKS_TTL_SECONDS })

    if (body.message?.chat?.id && process.env.TELEGRAM_BOT_TOKEN) {
      const summary = updatedTasks.length
        ? updatedTasks
            .map((t) => `${t.done ? '✅' : '⬜'} ${t.text}`)
            .join('\n')
        : 'Lista vacía.'

      await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: body.message.chat.id,
            text: `Actualizado:\n\n${summary}`,
          }),
        },
      )
    }

    return NextResponse.json({ tasks: updatedTasks })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: 'Error procesando tareas' },
      { status: 500 },
    )
  }
}
