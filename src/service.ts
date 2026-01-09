import { HealthCheck } from './db/schema'
import { Monitor } from './monitor'
import { NotificationHandler } from './notifications'
import { HealthCheckRepository } from './repository'
import { AppConfig, HealthCheckResult, Incident, Stats } from './types'

export interface HealthCheckService {
  processHeatCheck(): Promise<HealthCheckResult>
  getStats(startTime?: Date, endTime?: Date): Promise<Stats>
  currentIncident(consecutiveFailures: number): Promise<Incident | null>
}

interface HealthCheckServiceProps {
  repo: HealthCheckRepository
  config: AppConfig
  monitor: Monitor
  notificationHandlers: NotificationHandler[]
}

export const createHealthCheckService = ({
  repo,
  config,
  monitor,
  notificationHandlers,
}: HealthCheckServiceProps): HealthCheckService => {
  return {
    async processHeatCheck() {
      const checkResult = await monitor.check()
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
      } else if (
        checkResult.up &&
        consecutiveFailures >= config.monitor.gracePeriodFailures
      ) {
        // Only send UP notification if DOWN notification was previously sent
        // (i.e., consecutive failures reached grace period threshold)
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
      const checks = await repo.inPeriod(start, end)

      if (checks.length === 0) {
        return {
          totalChecks: 0,
          successfulChecks: 0,
          failedChecks: 0,
          uptimePercentage: 0,
          averageResponseTime: 0,
          currentStatus: 'down',
          lastCheckTime: '',
          incidents: [],
        }
      }

      // Calculate basic stats
      const successfulChecks = checks.filter((c) => c.up).length
      const failedChecks = checks.length - successfulChecks
      const uptimePercentage = (successfulChecks / checks.length) * 100

      const totalResponseTime = checks.reduce(
        (sum, c) => sum + c.responseTime,
        0,
      )
      const averageResponseTime = Math.round(totalResponseTime / checks.length)

      // Current status from most recent check
      const currentStatus = checks[0].up ? 'up' : 'down'
      const lastCheckTime = checks[0].timestamp.toISOString()

      // Calculate incidents (periods of consecutive failures)
      const incidents = calculateIncidents(checks)

      return {
        totalChecks: checks.length,
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
    if (!check.up) {
      // Start new incident if not already tracking one
      if (!currentIncident) {
        currentIncident = {
          startTime: check.timestamp.toISOString(),
          endTime: null,
          durationMinutes: 0,
          errorMessage: check.err || 'Unknown error',
        }
      }
    } else {
      // End current incident if one exists
      if (currentIncident) {
        currentIncident.endTime = check.timestamp.toISOString()
        currentIncident.durationMinutes = Math.round(
          (check.timestamp.getTime() -
            new Date(currentIncident.startTime).getTime()) /
            (60 * 1000),
        )
        incidents.push(currentIncident)
        currentIncident = null
      }
    }
  }

  // If incident is still ongoing, add it
  if (currentIncident) {
    currentIncident.durationMinutes = Math.round(
      (Date.now() - new Date(currentIncident.startTime).getTime()) /
        (60 * 1000),
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
