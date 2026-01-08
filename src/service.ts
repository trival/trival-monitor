import { HealthCheck } from './db/schema'
import { checkTarget } from './monitor'
import { NotificationHandler } from './notifications'
import { HealthCheckRepository } from './repository'
import { AppConfig, HealthCheckResult, Incident, Stats } from './types'

export interface HealthCheckService {
  processHeatCheck(): Promise<HealthCheckResult>
  getStats(startTime?: Date, endTime?: Date): Promise<Stats>
  currentIncident(consecutiveFailures: number): Promise<Incident | null>
}

export const createHealthCheckService = (
  repo: HealthCheckRepository,
  config: AppConfig,
  notificationHandlers: NotificationHandler[],
): HealthCheckService => {
  return {
    async processHeatCheck() {
      const checkResult = await checkTarget(config.monitor)
      const consecutiveFailures = await getConsecutiveFailures(repo)

      const newConsecutiveFailures = checkResult.up
        ? 0
        : consecutiveFailures + 1

      const result: HealthCheckResult = {
        ...checkResult,
        consecutiveFailures: newConsecutiveFailures,
      }

      await repo.save(result)

      // Grace period logic (console.log only in Stage 2)
      if (
        !checkResult.up &&
        newConsecutiveFailures === config.monitor.gracePeriodFailures
      ) {
        notificationHandlers.forEach(async (handler) => {
          await handler.sendDownNotification(
            config.monitor.serviceName,
            newConsecutiveFailures,
            checkResult.err,
          )
        })
      } else if (checkResult.up && consecutiveFailures > 0) {
        notificationHandlers.forEach(async (handler) => {
          await handler.sendUpNotification(
            config.monitor.serviceName,
            consecutiveFailures,
          )
        })
      }

      return result
    },

    async getStats(startTime, endTime): Promise<Stats> {
      const now = new Date()
      const end = endTime || now
      const start = startTime || new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago

      // Get all checks in time range using both start and end conditions
      const filteredChecks = await repo.inPeriod(start, end)

      if (filteredChecks.length === 0) {
        return {
          totalChecks: 0,
          successfulChecks: 0,
          failedChecks: 0,
          uptimePercentage: 0,
          averageResponseTime: 0,
          currentStatus: 'down',
          lastCheckTime: 0,
          incidents: [],
        }
      }

      // Calculate basic stats
      const successfulChecks = filteredChecks.filter((c) => c.up).length
      const failedChecks = filteredChecks.length - successfulChecks
      const uptimePercentage = (successfulChecks / filteredChecks.length) * 100

      const totalResponseTime = filteredChecks.reduce(
        (sum, c) => sum + c.ping,
        0,
      )
      const averageResponseTime = Math.round(
        totalResponseTime / filteredChecks.length,
      )

      // Current status from most recent check
      const currentStatus = filteredChecks[0].up ? 'up' : 'down'
      const lastCheckTime = Math.floor(
        filteredChecks[0].timestamp.getTime() / 1000,
      )

      // Calculate incidents (periods of consecutive failures)
      const incidents = calculateIncidents(filteredChecks)

      return {
        totalChecks: filteredChecks.length,
        successfulChecks,
        failedChecks,
        uptimePercentage: Math.round(uptimePercentage * 100) / 100,
        averageResponseTime,
        currentStatus,
        lastCheckTime,
        incidents,
      }
    },

    async currentIncident() {
      throw new Error('Not implemented yet: HealthCheckSericurrentIncident()')
    },
  }
}

// Helper functions

/**
 * Helper function to extract incidents from checks
 */
function calculateIncidents(checks: HealthCheck[]): Incident[] {
  const incidents: Incident[] = []
  let currentIncident: Incident | null = null

  // Process checks in chronological order (oldest first)
  const chronologicalChecks = [...checks].reverse()

  for (const check of chronologicalChecks) {
    const checkTime = Math.floor(check.timestamp.getTime() / 1000)

    if (!check.up) {
      // Start new incident if not already tracking one
      if (!currentIncident) {
        currentIncident = {
          startTime: checkTime,
          endTime: null,
          duration: 0,
          errorMessage: check.err || 'Unknown error',
        }
      }
    } else {
      // End current incident if one exists
      if (currentIncident) {
        currentIncident.endTime = checkTime
        currentIncident.duration = Math.round(
          (currentIncident.endTime - currentIncident.startTime) / 60,
        )
        incidents.push(currentIncident)
        currentIncident = null
      }
    }
  }

  // If incident is still ongoing, add it
  if (currentIncident) {
    const now = Math.floor(Date.now() / 1000)
    currentIncident.duration = Math.round(
      (now - currentIncident.startTime) / 60,
    )
    incidents.push(currentIncident)
  }

  return incidents.reverse() // Most recent first
}

async function getConsecutiveFailures(
  repo: HealthCheckRepository,
): Promise<number> {
  // Get the most recent check - it has the consecutiveFailures count
  const recentChecks = await repo.latest(1)

  if (recentChecks.length === 0) {
    return 0
  }

  return recentChecks[0].consecutiveFailures
}
