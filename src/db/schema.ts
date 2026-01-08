import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const healthCheckSchema = sqliteTable(
  'health_checks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    // Core check data
    timestamp: integer('timestamp', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),

    up: integer('up', { mode: 'boolean' }).notNull(), // true = success, false = failure
    responseTime: integer('response_time').notNull(), // Response time in milliseconds

    // Error tracking
    err: text('err'), // Error message if check failed, null if success

    // HTTP details
    statusCode: integer('status_code'), // HTTP status code (200, 500, etc.)

    // Incident tracking (for grace period logic)
    // Keep this field: makes grace period queries simpler
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  },
  (table) => [
    // Index for time-range queries (most common)
    index('timestamp_idx').on(table.timestamp),

    // Index for finding recent consecutive failures
    index('up_timestamp_idx').on(table.up, table.timestamp),
  ],
)

export type HealthCheck = typeof healthCheckSchema.$inferSelect
export type NewHealthCheck = typeof healthCheckSchema.$inferInsert
