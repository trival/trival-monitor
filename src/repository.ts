import { and, desc, gte, lte } from 'drizzle-orm'
import { DbInstance } from './db/db'
import { HealthCheck, healthCheckSchema } from './db/schema'
import type { HealthCheckResult } from './types'

export interface HealthCheckRepository {
  save(result: HealthCheckResult, timestamp?: Date): Promise<void>
  inPeriod(startTime: number, endTime: number): Promise<HealthCheck[]>
  latest(limit: number): Promise<HealthCheck[]>
}

export const createHealthCheckD1Repository = (
  db: DbInstance,
): HealthCheckRepository => {
  const repo = {} as HealthCheckRepository

  repo.save = async (result, timestamp) => {
    await db.insert(healthCheckSchema).values({
      up: result.up,
      ping: result.ping,
      err: result.err,
      statusCode: result.statusCode,
      consecutiveFailures: result.consecutiveFailures,
      timestamp: timestamp || new Date(), // Drizzle handles conversion
    })
  }

  repo.inPeriod = async (
    startTime: number,
    endTime: number,
  ): Promise<HealthCheck[]> => {
    return await db.query.healthChecks.findMany({
      where: and(
        gte(healthCheckSchema.timestamp, new Date(startTime)),
        lte(healthCheckSchema.timestamp, new Date(endTime)),
      ),
      orderBy: [desc(healthCheckSchema.timestamp)],
    })
  }

  repo.latest = async (limit: number): Promise<HealthCheck[]> => {
    return await db.query.healthChecks.findMany({
      orderBy: [desc(healthCheckSchema.timestamp)],
      limit,
    })
  }

  return repo
}
