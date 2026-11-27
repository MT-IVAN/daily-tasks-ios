import { NextResponse } from 'next/server'
import { GoogleGenAI, Type, Part } from '@google/genai'
import { redis, Task, getTodayTasksKey, TASKS_TTL_SECONDS } from '@/lib/redis'

const ai = new GoogleGenAI()

const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
]

async function downloadTelegramAudio(fileId: string): Promise<Part | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null

  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
  )
  const fileInfo = await fileInfoRes.json()
  const filePath = fileInfo?.result?.file_path
  if (!filePath) return null

  const audioRes = await fetch(
    `https://api.telegram.org/file/bot${token}/${filePath}`,
  )
  const arrayBuffer = await audioRes.arrayBuffer()

  return {
    inlineData: {
      data: Buffer.from(arrayBuffer).toString('base64'),
      mimeType: 'audio/ogg',
    },
  }
}

async function generateTasksWithFallback(contents: string | Part[]) {
  let lastError: unknown

  for (const model of FALLBACK_MODELS) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
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
      if (status === 503 || status === 429) {
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

    const textInput: string | undefined = body.prompt || body.message?.text
    const voiceFileId: string | undefined = body.message?.voice?.file_id

    // Si es un evento de Telegram sin texto ni audio (ej. sticker, edición), responde 200
    if (body.update_id && !textInput && !voiceFileId) {
      return NextResponse.json({ ok: true })
    }

    if (!textInput && !voiceFileId) {
      return NextResponse.json(
        { error: 'Falta texto o audio' },
        { status: 400 },
      )
    }

    const key = getTodayTasksKey()
    const currentTasks = (await redis.get<Task[]>(key)) || []

    const rules = `
      Estado actual de tareas de hoy (JSON): ${JSON.stringify(currentTasks)}
      
      Reglas estrictas para actualizar el JSON:
      1. AGREGAR TAREAS: Si pide agregar actividades, crea un objeto nuevo con un id único corto y "done": false, INCLUSO SI ya existe otra tarea igual en "done": true.
      2. COMPLETAR TAREAS: Si dice que ya hizo o completó algo, cambia una tarea pendiente ("done": false) coincidente a "done": true. No modifiques tareas que ya estén en "done": true.
      3. BORRAR / LIMPIAR: Si pide eliminar una tarea específica o limpiar todo, elimínala o devuelve [].
      4. Conserva intactos los "id", "text" y "done" de las demás tareas existentes.
    `

    // Rama excluyente: o procesa audio, o procesa texto
    let contents: string | Part[]

    if (voiceFileId) {
      const audioPart = await downloadTelegramAudio(voiceFileId)
      if (!audioPart) {
        return NextResponse.json(
          { error: 'No se pudo descargar la nota de voz' },
          { status: 500 },
        )
      }
      contents = [
        {
          text: `${rules}\nEscucha la nota de voz adjunta con la instrucción del usuario.`,
        },
        audioPart,
      ]
    } else {
      contents = `${rules}\nInstrucción del usuario: "${textInput}"`
    }

    const response = await generateTasksWithFallback(contents)
    const updatedTasks: Task[] = JSON.parse(response.text || '[]')

    await redis.set(key, updatedTasks, { ex: TASKS_TTL_SECONDS })

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
    console.error('Error procesando tareas:', error)
    return NextResponse.json(
      { error: 'Error procesando tareas' },
      { status: 500 },
    )
  }
}
