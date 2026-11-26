import { Redis } from '@upstash/redis'

export const redis = Redis.fromEnv()

export interface Task {
  id: string
  text: string
  done: boolean
}

export interface Expense {
  id: string
  merchant: string
  amount: number
  card: string
  category: string
  createdAt: string
}

export const TASKS_TTL_SECONDS = 60 * 60 * 48

export function getTodayDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()) // YYYY-MM-DD
}

export function getTodayTasksKey(): string {
  return `daily_tasks:${getTodayDateStr()}`
}

export function getCurrentMonthExpensesKey(): string {
  return `expenses:${getTodayDateStr().slice(0, 7)}` // expenses:YYYY-MM
}
