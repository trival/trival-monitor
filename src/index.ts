import { parseConfig } from './config'
import { createDb } from './db/db'
import { createEmailService } from './email'
import { formatStatsHtml, formatStatsMessage } from './email-templates'
import { createHTTPMonitor } from './monitor'
import {
  createConsoleNotificationHandler,
  createSMTPNotificationHandler,
  type NotificationHandler,
} from './notifications'
import { createHealthCheckD1Repository } from './repository'
import { createHealthCheckService } from './service'
import type { AppConfig, Env } from './types'

/**
 * Helper function to check bearer token authentication
 */
function checkAuth(request: Request, expectedToken: string): boolean {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return false
  }

  const token = authHeader.replace('Bearer ', '')
  return token === expectedToken
}

/**
 * Helper function to parse start/end time range parameters from URL
 * Expects Unix timestamps in seconds, returns undefined for invalid values
 */
function parseTimeRangeParams(url: URL): {
  startDate: Date | undefined
  endDate: Date | undefined
} {
  const startParam = url.searchParams.get('start')
  const endParam = url.searchParams.get('end')

  const startTime = startParam ? parseInt(startParam, 10) : undefined
  const endTime = endParam ? parseInt(endParam, 10) : undefined

  // Convert seconds to milliseconds for Date constructor
  const startDate =
    startTime && !isNaN(startTime) && startTime >= 0
      ? new Date(startTime * 1000)
      : undefined
  const endDate =
    endTime && !isNaN(endTime) && endTime >= 0
      ? new Date(endTime * 1000)
      : undefined

  return { startDate, endDate }
}

function createService(env: Env, config: AppConfig) {
  const db = createDb(env.DB)
  const repo = createHealthCheckD1Repository(db)
  const monitor = createHTTPMonitor(config.monitor)

  // Build notification handlers array
  const notificationHandlers: NotificationHandler[] = [
    createConsoleNotificationHandler(), // Always log to console
  ]

  // Add SMTP handler if configuration is present
  if (config.smtp) {
    notificationHandlers.push(
      createSMTPNotificationHandler(createEmailService(config.smtp)),
    )
  }

  const service = createHealthCheckService({
    repo,
    config,
    monitor,
    notificationHandlers,
  })
  return service
}

export default {
  /**
   * Scheduled handler - runs on cron trigger
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // Parse config may throw if required vars missing. Crash deliberately in that case.
    const service = createService(env, parseConfig(env))

    // Process health check
    try {
      await service.processHeatCheck()
    } catch (error: any) {
      console.error('[SCHEDULED ERROR]', error.message)
      // Don't throw - worker should not crash on monitoring errors
    }
  },

  /**
   * HTTP request handler - serves API endpoints
   * ALL endpoints require bearer token authentication
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Parse config (may throw if required vars missing)
    let config
    try {
      config = parseConfig(env)
    } catch (error: any) {
      return Response.json(
        { error: 'Configuration error', message: error.message },
        { status: 500 },
      )
    }

    // Check bearer token authentication for ALL endpoints
    if (!checkAuth(request, config.apiBearerToken)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const service = createService(env, config)

    // GET / - Service info and health check
    if (url.pathname === '/' && request.method === 'GET') {
      try {
        const stats = await service.getStats()
        return Response.json({
          service: config.monitor.serviceName,
          target: config.monitor.targetUrl,
          status: stats.currentStatus,
          lastCheck: stats.lastCheckTime,
        })
      } catch (error: any) {
        return Response.json(
          { error: 'Failed to get service info', message: error.message },
          { status: 500 },
        )
      }
    }

    // GET /stats - Get statistics (with optional time range)
    if (url.pathname === '/stats' && request.method === 'GET') {
      try {
        const { startDate, endDate } = parseTimeRangeParams(url)
        const stats = await service.getStats(startDate, endDate)

        return Response.json(stats)
      } catch (error: any) {
        return Response.json(
          { error: 'Failed to fetch statistics', message: error.message },
          { status: 500 },
        )
      }
    }

    // POST /trigger-check - Manually trigger a health check
    if (url.pathname === '/trigger-check' && request.method === 'POST') {
      try {
        const result = await service.processHeatCheck()

        return Response.json({
          success: true,
          result,
          message: `Check completed. Status: ${result.up ? 'UP' : 'DOWN'}`,
        })
      } catch (error: any) {
        return Response.json(
          { error: 'Failed to perform check', message: error.message },
          { status: 500 },
        )
      }
    }

    // POST /send-stats-email - Send stats report via email
    if (url.pathname === '/send-stats-email' && request.method === 'POST') {
      try {
        // Check SMTP configuration
        if (!config.smtp) {
          return Response.json(
            { error: 'Email is not configured' },
            { status: 400 },
          )
        }

        // Parse time range parameters
        const { startDate, endDate } = parseTimeRangeParams(url)

        // Get stats from service
        const stats = await service.getStats(startDate, endDate)

        // Format time range for email
        const now = new Date()
        const defaultEnd = endDate || now
        const defaultStart =
          startDate || new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const isDefaultRange = !startDate && !endDate
        const timeRange = isDefaultRange
          ? 'Last 24 hours'
          : `${defaultStart.toISOString()} to ${defaultEnd.toISOString()}`

        // Create email service and send
        const emailService = createEmailService(config.smtp)
        const plainText = formatStatsMessage(
          config.monitor.serviceName,
          stats,
          timeRange,
        )
        const html = formatStatsHtml(plainText, stats)

        await emailService.send(
          `[STATS] ${config.monitor.serviceName} - Health Statistics Report`,
          plainText,
          html,
        )

        return Response.json({
          success: true,
          message: 'Stats email sent successfully',
        })
      } catch (error: any) {
        return Response.json(
          { error: 'Failed to send stats email', message: error.message },
          { status: 500 },
        )
      }
    }

    // 404 for unknown routes
    return new Response('Not Found', { status: 404 })
  },
}
