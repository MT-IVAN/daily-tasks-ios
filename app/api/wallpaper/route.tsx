import { ImageResponse } from 'next/og'
import { redis, Task, TASKS_KEY } from '@/lib/redis'

export async function GET() {
  const tasks = (await redis.get<Task[]>(TASKS_KEY)) || []

  const total = tasks.length
  const completed = tasks.filter((t) => t.done).length
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100)

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        color: '#ffffff',
        paddingTop: '880px', // Espacio libre arriba para el reloj de iOS
        paddingLeft: '90px',
        paddingRight: '90px',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Encabezado y porcentaje */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '24px',
        }}
      >
        <span style={{ fontSize: 34, color: '#888888', letterSpacing: 4 }}>
          OBJETIVOS DE HOY
        </span>
        <span style={{ fontSize: 44, fontWeight: 'bold', color: '#ffffff' }}>
          {progress}%
        </span>
      </div>

      {/* Barra de progreso */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '14px',
          backgroundColor: '#1f1f1f',
          borderRadius: '7px',
          marginBottom: '60px',
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

      {/* Lista de actividades */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {tasks.length === 0 ? (
          <span style={{ fontSize: 38, color: '#555555' }}>
            Sin actividades pendientes para hoy.
          </span>
        ) : (
          tasks.map((task) => (
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
                  border: task.done ? 'none' : '3px solid #555555',
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
                  color: task.done ? '#555555' : '#f4f4f5',
                  textDecoration: task.done ? 'line-through' : 'none',
                }}
              >
                {task.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>,
    {
      width: 1179,
      height: 2556,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  )
}
