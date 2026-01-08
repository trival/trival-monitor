import { drizzle } from 'drizzle-orm/d1'
import { healthCheckSchema } from './schema'

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema: { healthChecks: healthCheckSchema } })
}

export type DbInstance = ReturnType<typeof createDb>
