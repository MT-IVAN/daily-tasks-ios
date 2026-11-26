import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import { redis, Task, TASKS_KEY } from '@/lib/redis'

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
  const tasks = (await redis.get<Task[]>(TASKS_KEY)) || []
  return NextResponse.json({ tasks })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
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

    const currentTasks = (await redis.get<Task[]>(TASKS_KEY)) || []

    const instruction = `
      Estado actual de tareas (JSON): ${JSON.stringify(currentTasks)}
      Instrucción del usuario: "${userPrompt}"
      
      Actualiza la lista de tareas según la instrucción del usuario:
      - Si pide agregar actividades, créalas con done: false y un id único corto.
      - Si dice que ya hizo o completó algo, cambia done a true en la tarea correspondiente.
      - Si pide limpiar, reiniciar el día o borrar todo, devuelve un array vacío o conserva solo las que pida.
    `

    const response = await generateTasksWithFallback(instruction)
    const updatedTasks: Task[] = JSON.parse(response.text || '[]')
    await redis.set(TASKS_KEY, updatedTasks)

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
