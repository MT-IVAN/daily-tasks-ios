'use client'

import { useState, useEffect } from 'react'
import type { Task } from '@/lib/redis'

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  // Inicializamos en 0 (valor determinista) para evitar el hydration mismatch
  const [imgTimestamp, setImgTimestamp] = useState<number>(0)

  useEffect(() => {
    setImgTimestamp(Date.now())

    fetch('/api/tasks')
      .then(async (res) => {
        if (!res.ok) return { tasks: [] }
        const text = await res.text()
        return text ? JSON.parse(text) : { tasks: [] }
      })
      .then((data) => setTasks(data.tasks || []))
      .catch((err) => console.error('Error cargando tareas:', err))
  }, [])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim()) return

    setLoading(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })

      const text = await res.text()
      const data = text ? JSON.parse(text) : {}

      if (data.tasks) {
        setTasks(data.tasks)
        setImgTimestamp(Date.now())
      }
    } catch (err) {
      console.error('Error enviando instrucción:', err)
    } finally {
      setPrompt('')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-8 flex flex-col md:flex-row gap-12 justify-center items-start">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold">Daily Always-On Tasks</h1>

        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='Ej: "Agrega entrenar y leer" o "Ya entrené"'
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-green-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            {loading ? '...' : 'Enviar'}
          </button>
        </form>

        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className={`p-3 rounded-lg border border-neutral-900 bg-neutral-900/50 text-sm ${
                t.done ? 'line-through text-neutral-500' : 'text-neutral-200'
              }`}
            >
              {t.done ? '✅' : '⬜'} {t.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="w-64 border-4 border-neutral-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <img
          src={
            imgTimestamp ? `/api/wallpaper?t=${imgTimestamp}` : '/api/wallpaper'
          }
          alt="Wallpaper preview"
          className="w-full h-auto"
        />
      </div>
    </main>
  )
}
