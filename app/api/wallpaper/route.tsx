import { ImageResponse } from 'next/og'
import {
  redis,
  Task,
  Expense,
  getTodayDateStr,
  getTodayTasksKey,
  getCurrentMonthExpensesKey,
} from '@/lib/redis'

function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CO')}`
}

function getBogotaParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const map: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }

  return {
    dateStr: `${map.year}-${map.month}-${map.day}`, // YYYY-MM-DD
    weekday: map.weekday, // Mon, Tue, Wed, Thu, Fri, Sat, Sun
    hour: Number(map.hour === '24' ? '0' : map.hour),
  }
}

// Devuelve el YYYY-MM-DD del lunes de la semana actual en Bogotá
function getMondayOfCurrentWeekStr(now: Date): string {
  const { dateStr, weekday } = getBogotaParts(now)
  const dayOffsetMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }
  const offset = dayOffsetMap[weekday] ?? 0
  const [y, m, d] = dateStr.split('-').map(Number)
  const mondayUtc = new Date(Date.UTC(y, m - 1, d - offset))
  return mondayUtc.toISOString().slice(0, 10)
}

export async function GET() {
  const now = new Date()
  const todayStr = getTodayDateStr()
  const mondayStr = getMondayOfCurrentWeekStr(now)

  const [tasksData, expensesData] = await Promise.all([
    redis.get<Task[]>(getTodayTasksKey()),
    redis.lrange<Expense>(getCurrentMonthExpensesKey(), 0, -1),
  ])

  const tasks = tasksData || []
  const expenses = expensesData || []

  // Métricas de tareas
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((t) => t.done).length
  const progress =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  // Métricas de gastos
  let todayTotal = 0
  let monthTotal = 0
  let weekWorkdaysTotal = 0 // Lun - Vie 17:59
  let weekWeekendTotal = 0 // Vie 18:00 - Dom 23:59

  for (const e of expenses) {
    const amount = Number(e.amount) || 0
    monthTotal += amount

    const { dateStr, weekday, hour } = getBogotaParts(new Date(e.createdAt))

    if (dateStr === todayStr) {
      todayTotal += amount
    }

    // Si pertenece a la semana actual (desde el lunes hasta hoy)
    if (dateStr >= mondayStr && dateStr <= todayStr) {
      const isWeekend =
        weekday === 'Sat' ||
        weekday === 'Sun' ||
        (weekday === 'Fri' && hour >= 18)

      if (isWeekend) {
        weekWeekendTotal += amount
      } else {
        weekWorkdaysTotal += amount
      }
    }
  }

  const lastExpense = expenses[0]

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#09090b',
        color: '#ffffff',
        paddingTop: '820px',
        paddingBottom: '340px', // Sube la tarjeta por encima de los botones inferiores
        paddingLeft: '85px',
        paddingRight: '85px',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Sección Superior: Tareas del día */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '22px',
          }}
        >
          <span style={{ fontSize: 32, color: '#a1a1aa', letterSpacing: 4 }}>
            OBJETIVOS DE HOY
          </span>
          <span style={{ fontSize: 42, fontWeight: 'bold', color: '#ffffff' }}>
            {progress}%
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '14px',
            backgroundColor: '#1f1f23',
            borderRadius: '7px',
            marginBottom: '48px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: '#22c55e',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
          {tasks.length === 0 ? (
            <span style={{ fontSize: 36, color: '#71717a' }}>
              Sin actividades pendientes para hoy.
            </span>
          ) : (
            tasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '22px',
                }}
              >
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    border: task.done ? 'none' : '3px solid #71717a',
                    backgroundColor: task.done ? '#22c55e' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    color: '#000000',
                    fontWeight: 'bold',
                  }}
                >
                  {task.done ? '✓' : ''}
                </div>
                <span
                  style={{
                    fontSize: 40,
                    fontWeight: task.done ? 400 : 600,
                    color: task.done ? '#71717a' : '#ffffff',
                    textDecoration: task.done ? 'line-through' : 'none',
                  }}
                >
                  {task.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sección Inferior: Gastos + Métrica Semanal */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#141417',
          border: '2px solid #27272a',
          borderRadius: '32px',
          padding: '36px 42px',
          gap: '26px',
        }}
      >
        {/* Encabezado y última transacción */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 26, color: '#a1a1aa', letterSpacing: 3 }}>
            GASTOS
          </span>
          {lastExpense && (
            <span style={{ fontSize: 26, color: '#a1a1aa' }}>
              Último: {lastExpense.merchant} ({formatCOP(lastExpense.amount)})
            </span>
          )}
        </div>

        {/* Fila 1: Hoy vs Mes */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: 24, color: '#71717a' }}>HOY</span>
            <span
              style={{ fontSize: 44, fontWeight: 'bold', color: '#ffffff' }}
            >
              {formatCOP(todayTotal)}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: 24, color: '#71717a' }}>ESTE MES</span>
            <span
              style={{ fontSize: 44, fontWeight: 'bold', color: '#f59e0b' }}
            >
              {formatCOP(monthTotal)}
            </span>
          </div>
        </div>

        {/* Separador */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '2px',
            backgroundColor: '#27272a',
          }}
        />

        {/* Fila 2: Segregación Semanal (Hábiles vs Finde desde Vie 6pm) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: 22, color: '#71717a' }}>
              SEM · HÁBILES
            </span>
            <span style={{ fontSize: 34, fontWeight: 600, color: '#e4e4e7' }}>
              {formatCOP(weekWorkdaysTotal)}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: 22, color: '#71717a' }}>
              SEM · FINDE (VIE 6PM+)
            </span>
            <span style={{ fontSize: 34, fontWeight: 600, color: '#38bdf8' }}>
              {formatCOP(weekWeekendTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>,
    {
      width: 1206,
      height: 2622,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  )
}
