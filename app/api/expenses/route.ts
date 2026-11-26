import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import { redis } from '@/lib/redis'

const ai = new GoogleGenAI()

const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
]

async function classifyExpenseWithFallback(prompt: string) {
  let lastError: unknown

  for (const model of FALLBACK_MODELS) {
    try {
      return await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description:
                  'Categoría del gasto: Comida, Café, Transporte, Supermercado, Ocio, Salud, Compras u Otro',
              },
              cleanMerchant: {
                type: Type.STRING,
                description: 'Nombre limpio y legible del comercio',
              },
              numericAmount: {
                type: Type.NUMBER,
                description:
                  'Valor numérico exacto del monto sin símbolos ni separadores de miles',
              },
            },
            required: ['category', 'cleanMerchant', 'numericAmount'],
          },
        },
      })
    } catch (error: any) {
      lastError = error
      const status = error?.status || error?.code
      if (status === 503 || status === 429) {
        console.warn(
          `Modelo ${model} saturado (${status}), intentando fallback en expenses...`,
        )
        continue
      }
      throw error
    }
  }

  throw lastError
}

export async function GET() {
  console.log('Some is requesting expenses... ')
  const monthStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())

  const expenses = await redis.lrange(`expenses:${monthStr}`, 0, -1)
  return NextResponse.json({ expenses })
}

export async function POST(req: Request) {
  try {
    const parsedBody = await req.json()
    console.log('Some is creating expenses... ', parsedBody)
    const { merchant, amount, card } = parsedBody

    if (!merchant || amount === undefined) {
      return NextResponse.json(
        { error: 'Faltan datos del gasto' },
        { status: 400 },
      )
    }

    const prompt = `
      Analiza esta transacción de Apple Pay en Colombia:
      - Comercio crudo: "${merchant}"
      - Monto crudo: "${amount}"
      
      Devuelve la categoría más adecuada, el nombre limpio del comercio (ej. "JUAN VALDEZ CAFE PASTO" -> "Juan Valdez") y el valor numérico exacto (ej. "$ 14.500" -> 14500).
    `

    const aiRes = await classifyExpenseWithFallback(prompt)
    const parsed = JSON.parse(aiRes.text || '{}')

    // Fecha y mes en zona horaria UTC-5 (America/Bogota)
    const now = new Date()
    const monthStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
    }).format(now)

    const expense = {
      id: crypto.randomUUID(),
      merchant: parsed.cleanMerchant || merchant,
      amount:
        typeof parsed.numericAmount === 'number'
          ? parsed.numericAmount
          : Number(String(amount).replace(/[^0-9]/g, '')),
      card: card || 'Apple Pay',
      category: parsed.category || 'Otro',
      createdAt: now.toISOString(),
    }

    await redis.lpush(`expenses:${monthStr}`, expense)

    return NextResponse.json({ ok: true, expense })
  } catch (error) {
    console.error('Error guardando gasto:', error)
    return NextResponse.json(
      { error: 'Error procesando gasto' },
      { status: 500 },
    )
  }
}
