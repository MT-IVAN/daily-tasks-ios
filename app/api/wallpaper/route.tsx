import { ImageResponse } from 'next/og'
import {
  redis,
  Task,
  Expense,
  getTodayDateStr,
  getTodayTasksKey,
  getCurrentMonthExpensesKey,
} from '@/lib/redis'

export const runtime = 'edge'

function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CO')}`
}

export async function GET() {
  const todayStr = getTodayDateStr()

  const [tasksData, expensesData] = await Promise.all([
    redis.get<Task[]>(getTodayTasksKey()),
    redis.lrange<Expense>(getCurrentMonthExpensesKey(), 0, -1),
  ])

  const tasks = tasksData || []
  const expenses = expensesData || []

  // Task metrics
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((t) => t.done).length
  const progress =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  // Expense metrics (in America/Bogota time)
  const monthTotal = expenses.reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0,
  )
  const todayTotal = expenses
    .filter((e) => {
      const expenseDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(e.createdAt))
      return expenseDay === todayStr
    })
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  const lastExpense = expenses[0] // lpush puts newest first

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#09090b', // Prevents iOS lock screen black-dimming bug
        color: '#ffffff',
        paddingTop: '880px', // Leaves top third clear for iOS clock & widgets
        paddingBottom: '180px', // Leaves bottom clear for flashlight/camera buttons
        paddingLeft: '90px',
        paddingRight: '90px',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Top Section: Daily Tasks */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '24px',
          }}
        >
          <span style={{ fontSize: 34, color: '#a1a1aa', letterSpacing: 4 }}>
            OBJETIVOS DE HOY
          </span>
          <span style={{ fontSize: 44, fontWeight: 'bold', color: '#ffffff' }}>
            {progress}%
          </span>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '14px',
            backgroundColor: '#1f1f23',
            borderRadius: '7px',
            marginBottom: '56px',
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

        {/* Task List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {tasks.length === 0 ? (
            <span style={{ fontSize: 38, color: '#71717a' }}>
              Sin actividades pendientes para hoy.
            </span>
          ) : (
            tasks.slice(0, 6).map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '24px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    border: task.done ? 'none' : '3px solid #71717a',
                    backgroundColor: task.done ? '#22c55e' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    color: '#000000',
                    fontWeight: 'bold',
                  }}
                >
                  {task.done ? '✓' : ''}
                </div>
                <span
                  style={{
                    fontSize: 42,
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

      {/* Bottom Section: Expenses Card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#141417',
          border: '2px solid #27272a',
          borderRadius: '32px',
          padding: '40px 44px',
          gap: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 28, color: '#a1a1aa', letterSpacing: 3 }}>
            GASTOS
          </span>
          {lastExpense && (
            <span style={{ fontSize: 28, color: '#71717a' }}>
              Último: {lastExpense.merchant} ({formatCOP(lastExpense.amount)})
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: 26, color: '#71717a' }}>HOY</span>
            <span
              style={{ fontSize: 48, fontWeight: 'bold', color: '#ffffff' }}
            >
              {formatCOP(todayTotal)}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: 26, color: '#71717a' }}>ESTE MES</span>
            <span
              style={{ fontSize: 48, fontWeight: 'bold', color: '#f59e0b' }}
            >
              {formatCOP(monthTotal)}
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
