import { Redis } from '@upstash/redis'

export const redis = Redis.fromEnv()

export interface Task {
  id: string
  text: string
  done: boolean
}
const TIME_IN_HOURS = 30
export const TASKS_TTL_SECONDS = 60 * 60 * TIME_IN_HOURS

export function getTodayTasksKey(): string {
  // Devuelve YYYY-MM-DD en zona horaria UTC-5 (America/Bogota)
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  return `daily_tasks:${todayStr}`
}
