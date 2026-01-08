import { parseConfig } from './config'
import { createDb } from './db/db'
import { createHTTPMonitor } from './monitor'
import { createConsoleNotificationHandler } from './notifications'
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

function createService(env: Env, config: AppConfig) {
  const db = createDb(env.DB)
  const repo = createHealthCheckD1Repository(db)
  const monitor = createHTTPMonitor(config.monitor)
  const service = createHealthCheckService({
    repo,
    config,
    monitor,
    notificationHandlers: [createConsoleNotificationHandler()],
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
    console.log('[SCHEDULED] Running scheduled health check')

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
    console.log(`[HTTP] ${request.method} ${request.url}`)

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
        // Parse optional query parameters for custom time range
        const startParam = url.searchParams.get('start')
        const endParam = url.searchParams.get('end')

        const startTime = startParam ? parseInt(startParam, 10) : undefined
        const endTime = endParam ? parseInt(endParam, 10) : undefined

        const startDate =
          startTime && !isNaN(startTime) ? new Date(startTime) : undefined
        const endDate =
          endTime && !isNaN(endTime) ? new Date(endTime) : undefined

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

    // 404 for unknown routes
    return new Response('Not Found', { status: 404 })
  },
}
