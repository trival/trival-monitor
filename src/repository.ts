import { and, desc, gte, lte } from 'drizzle-orm'
import { DbInstance } from './db/db'
import { HealthCheck, healthCheckSchema } from './db/schema'
import type { HealthCheckResult } from './types'

export interface HealthCheckRepository {
  save(result: HealthCheckResult, timestamp?: Date): Promise<void>
  inPeriod(startTime: Date, endTime: Date): Promise<HealthCheck[]>
  latest(limit: number): Promise<HealthCheck[]>
}

export const createHealthCheckD1Repository = (
  db: DbInstance,
): HealthCheckRepository => {
  const repo = {} as HealthCheckRepository

  repo.save = async (result, timestamp) => {
    await db.insert(healthCheckSchema).values({
      up: result.up,
      responseTime: result.responseTime,
      err: result.err,
      statusCode: result.statusCode,
      consecutiveFailures: result.consecutiveFailures,
      timestamp: timestamp || new Date(), // Drizzle handles conversion
    })
  }

  repo.inPeriod = async (startTime, endTime): Promise<HealthCheck[]> => {
    return await db.query.healthChecks.findMany({
      where: and(
        gte(healthCheckSchema.timestamp, startTime),
        lte(healthCheckSchema.timestamp, endTime),
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

export function createHealthCheckInMemoryRepository(): HealthCheckRepository {
  const checks: HealthCheck[] = []

  return {
    async save(result, timestamp) {
      checks.push({
        id: checks.length + 1,
        up: result.up,
        responseTime: result.responseTime,
        err: result.err,
        statusCode: result.statusCode,
        consecutiveFailures: result.consecutiveFailures,
        timestamp: timestamp || new Date(),
      })
    },

    async inPeriod(startTime, endTime) {
      return checks
        .filter(
          (check) => check.timestamp >= startTime && check.timestamp <= endTime,
        )
        .reverse()
    },

    async latest(limit) {
      return checks.slice(-limit).reverse()
    },
  }
}

export async function testCleanRepository(repo: HealthCheckRepository) {
  function assert(condition: boolean, message: string) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`)
    }
  }

  let checks = await repo.latest(10)

  assert(checks.length === 0, 'Repository is not clean')

  const now = new Date()
  checks = await repo.inPeriod(new Date(now.getTime() - 10000), now)

  assert(checks.length === 0, 'Repository is not clean')

  // fill test data

  for (let i = 5; i >= 0; i--) {
    await repo.save(
      {
        up: true,
        responseTime: 100 + i,
        err: null,
        statusCode: 200,
        consecutiveFailures: 0,
      },
      new Date(now.getTime() - (i + 3) * 1000),
    )
  }
  await repo.save(
    {
      up: true,
      responseTime: 300,
      err: 'timeout',
      statusCode: 0,
      consecutiveFailures: 1,
    },
    new Date(now.getTime() - 2 * 1000),
  )
  await repo.save(
    {
      up: true,
      responseTime: 300,
      err: 'timeout',
      statusCode: 0,
      consecutiveFailures: 2,
    },
    new Date(now.getTime() - 1 * 1000),
  )
  await repo.save(
    {
      up: true,
      responseTime: 100,
      err: null,
      statusCode: 200,
      consecutiveFailures: 0,
    },
    new Date(now.getTime()),
  )

  // test latest
  checks = await repo.latest(5)
  assert(checks.length === 5, 'Latest: Incorrect number of checks returned')
  assert(checks[0].responseTime === 100, 'Latest: Most recent check incorrect')
  assert(checks[1].responseTime === 300, 'Latest: Oldest check incorrect')
  assert(checks[4].responseTime === 101, 'Latest: Oldest check incorrect')

  // test inPeriod

  checks = await repo.inPeriod(
    new Date(now.getTime() - 4000),
    new Date(now.getTime() - 1000),
  )
  assert(checks.length === 4, 'inPeriod: Incorrect number of checks returned')
  assert(
    checks[0].responseTime === 300,
    'inPeriod: Most recent check incorrect',
  )
  assert(checks[3].responseTime === 101, 'inPeriod: Oldest check incorrect, ')
}
