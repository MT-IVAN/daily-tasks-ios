import { Redis } from '@upstash/redis'

export const redis = Redis.fromEnv()

export interface Task {
  id: string
  text: string
  done: boolean
}

export const TASKS_KEY = 'daily_tasks'
