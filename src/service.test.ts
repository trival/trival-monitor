import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Monitor, MonitorCheckResult } from './monitor'
import type { NotificationHandler } from './notifications'
import type { HealthCheckRepository } from './repository'
import { createHealthCheckInMemoryRepository } from './repository'
import { createHealthCheckService, type HealthCheckService } from './service'
import type { AppConfig } from './types'

// Helpers to create monitor results
function createMonitorResult(
  overrides: Partial<MonitorCheckResult> = {},
): MonitorCheckResult {
  return {
    up: true,
    responseTime: 100,
    err: null,
    statusCode: 200,
    ...overrides,
  }
}

function failureResult(err: string = 'Timeout'): MonitorCheckResult {
  return createMonitorResult({
    up: false,
    responseTime: 5000,
    err,
    statusCode: null,
  })
}

// Test fixtures
const defaultConfig: AppConfig = {
  monitor: {
    serviceName: 'Test Service',
    targetUrl: 'https://example.com',
    httpMethod: 'GET',
    pingTimeout: 10000,
    gracePeriodFailures: 3,
    expectedCodes: [200, 201, 202, 203, 204],
  },
  apiBearerToken: 'test-token',
}

describe('HealthCheckService', () => {
  let repo: HealthCheckRepository
  let service: HealthCheckService
  let monitorCheckMock: ReturnType<typeof mock>
  let sendDownNotificationMock: ReturnType<typeof mock>
  let sendUpNotificationMock: ReturnType<typeof mock>

  // Helper to set monitor mock return value
  function setMonitorResult(overrides: Partial<MonitorCheckResult> = {}) {
    monitorCheckMock.mockResolvedValue(createMonitorResult(overrides))
  }

  // Helper to set monitor to return failure
  function setMonitorFailure(err: string = 'Timeout') {
    monitorCheckMock.mockResolvedValue(failureResult(err))
  }

  beforeEach(() => {
    // Create fresh repository
    repo = createHealthCheckInMemoryRepository()

    // Create mock functions
    monitorCheckMock = mock(() => Promise.resolve(createMonitorResult()))
    sendDownNotificationMock = mock(() => Promise.resolve())
    sendUpNotificationMock = mock(() => Promise.resolve())

    // Create monitor with mock
    const monitor: Monitor = {
      check: monitorCheckMock,
    }

    // Create notification handler with mocks
    const notificationHandler: NotificationHandler = {
      sendDownNotification: sendDownNotificationMock,
      sendUpNotification: sendUpNotificationMock,
    }

    // Create service
    service = createHealthCheckService({
      repo,
      config: defaultConfig,
      monitor,
      notificationHandlers: [notificationHandler],
    })
  })

  describe('processHealthCheck', () => {
    test('first successful check sets consecutiveFailures to 0', async () => {
      const result = await service.processHeatCheck()

      expect(result.up).toBe(true)
      expect(result.responseTime).toBe(100)
      expect(result.statusCode).toBe(200)
      expect(result.consecutiveFailures).toBe(0)
      expect(sendDownNotificationMock).not.toHaveBeenCalled()
      expect(sendUpNotificationMock).not.toHaveBeenCalled()
    })

    test('first failure increments consecutiveFailures to 1', async () => {
      setMonitorFailure('Timeout after 5000ms')

      const result = await service.processHeatCheck()

      expect(result.up).toBe(false)
      expect(result.consecutiveFailures).toBe(1)
      expect(result.err).toBe('Timeout after 5000ms')
      expect(sendDownNotificationMock).not.toHaveBeenCalled()
    })

    test('consecutive failures increment counter', async () => {
      setMonitorFailure()

      const result1 = await service.processHeatCheck()
      expect(result1.consecutiveFailures).toBe(1)

      const result2 = await service.processHeatCheck()
      expect(result2.consecutiveFailures).toBe(2)

      expect(sendDownNotificationMock).not.toHaveBeenCalled()
    })

    test('grace period triggers notification on threshold', async () => {
      setMonitorFailure('Connection refused')

      // Fail 2 times (no notification)
      await service.processHeatCheck()
      await service.processHeatCheck()
      expect(sendDownNotificationMock).not.toHaveBeenCalled()

      // Third failure triggers notification
      const result3 = await service.processHeatCheck()

      expect(result3.consecutiveFailures).toBe(3)
      expect(sendDownNotificationMock).toHaveBeenCalledTimes(1)
      expect(sendDownNotificationMock).toHaveBeenCalledWith(
        'Test Service',
        3,
        'Connection refused',
      )
    })

    test('grace period with custom threshold', async () => {
      // Recreate service with custom grace period
      const customConfig: AppConfig = {
        ...defaultConfig,
        monitor: {
          ...defaultConfig.monitor,
          gracePeriodFailures: 5,
        },
      }

      service = createHealthCheckService({
        repo,
        config: customConfig,
        monitor: { check: monitorCheckMock },
        notificationHandlers: [
          {
            sendDownNotification: sendDownNotificationMock,
            sendUpNotification: sendUpNotificationMock,
          },
        ],
      })

      setMonitorFailure()

      // Fail 4 times (no notification)
      for (let i = 0; i < 4; i++) {
        await service.processHeatCheck()
      }
      expect(sendDownNotificationMock).not.toHaveBeenCalled()

      // Fifth failure triggers notification
      const result5 = await service.processHeatCheck()

      expect(result5.consecutiveFailures).toBe(5)
      expect(sendDownNotificationMock).toHaveBeenCalledTimes(1)
      expect(sendDownNotificationMock).toHaveBeenCalledWith(
        'Test Service',
        5,
        'Timeout',
      )
    })

    test('success after failures resets counter but NO UP notification (grace period not reached)', async () => {
      // Fail 2 times (below grace period threshold of 3)
      setMonitorFailure()
      await service.processHeatCheck()
      await service.processHeatCheck()

      // Success resets counter
      setMonitorResult()
      let result = await service.processHeatCheck()
      expect(result.consecutiveFailures).toBe(0)

      // Fail 2 times again (below grace period threshold of 3)
      setMonitorFailure()
      await service.processHeatCheck()
      result = await service.processHeatCheck()

      expect(result.consecutiveFailures).toBe(2)

      // Success resets counter again
      setMonitorResult()
      result = await service.processHeatCheck()

      expect(result.consecutiveFailures).toBe(0)
      expect(result.up).toBe(true)
      // No UP notification because DOWN notification was never sent (grace period not reached)
      expect(sendUpNotificationMock).not.toHaveBeenCalled()
      expect(sendDownNotificationMock).not.toHaveBeenCalled()
    })

    test('success after exceeding grace period sends UP notification', async () => {
      // Fail 3 times (triggers DOWN notification)
      setMonitorFailure()
      await service.processHeatCheck()
      await service.processHeatCheck()
      await service.processHeatCheck()

      expect(sendDownNotificationMock).toHaveBeenCalledTimes(1)

      // Success sends UP notification
      setMonitorResult()
      const result = await service.processHeatCheck()

      expect(result.consecutiveFailures).toBe(0)
      expect(sendUpNotificationMock).toHaveBeenCalledTimes(1)
      expect(sendUpNotificationMock).toHaveBeenCalledWith('Test Service', 3)
    })

    test('no UP notification if there were no failures', async () => {
      await service.processHeatCheck()
      await service.processHeatCheck()

      expect(sendUpNotificationMock).not.toHaveBeenCalled()
    })

    test('multiple notification handlers all receive calls', async () => {
      const handler2Down = mock(() => Promise.resolve())
      const handler2Up = mock(() => Promise.resolve())

      service = createHealthCheckService({
        repo,
        config: defaultConfig,
        monitor: { check: monitorCheckMock },
        notificationHandlers: [
          {
            sendDownNotification: sendDownNotificationMock,
            sendUpNotification: sendUpNotificationMock,
          },
          {
            sendDownNotification: handler2Down,
            sendUpNotification: handler2Up,
          },
        ],
      })

      // Fail to grace period threshold
      setMonitorFailure()
      await service.processHeatCheck()
      await service.processHeatCheck()
      await service.processHeatCheck()

      // Both handlers receive DOWN notification
      expect(sendDownNotificationMock).toHaveBeenCalledTimes(1)
      expect(handler2Down).toHaveBeenCalledTimes(1)
    })

    test('long downtime - many consecutive failures', async () => {
      setMonitorFailure()

      // Fail 10 times
      for (let i = 1; i <= 10; i++) {
        const result = await service.processHeatCheck()
        expect(result.consecutiveFailures).toBe(i)
      }

      // Only one DOWN notification at threshold (3)
      expect(sendDownNotificationMock).toHaveBeenCalledTimes(1)
      expect(sendDownNotificationMock).toHaveBeenCalledWith(
        'Test Service',
        3,
        'Timeout',
      )

      // Verify data stored correctly
      const checks = await repo.latest(10)
      expect(checks.length).toBe(10)
      expect(checks[0].consecutiveFailures).toBe(10) // Most recent
      expect(checks[9].consecutiveFailures).toBe(1) // Oldest

      // Recovery
      setMonitorResult()
      await service.processHeatCheck()
      await service.processHeatCheck()
      await service.processHeatCheck()
      const recoveryResult = await service.processHeatCheck()
      expect(recoveryResult.consecutiveFailures).toBe(0)

      expect(sendUpNotificationMock).toHaveBeenCalledTimes(1)
      expect(sendUpNotificationMock).toHaveBeenCalledWith('Test Service', 10)
    })
  })

  describe('getStats', () => {
    test('returns empty stats for empty database', async () => {
      const stats = await service.getStats()

      expect(stats.totalChecks).toBe(0)
      expect(stats.successfulChecks).toBe(0)
      expect(stats.failedChecks).toBe(0)
      expect(stats.uptimePercentage).toBe(0)
      expect(stats.averageResponseTime).toBe(0)
      expect(stats.currentStatus).toBe('down')
      expect(stats.lastCheckTime).toBe(0)
      expect(stats.incidents).toEqual([])
    })

    test('calculates stats for single check', async () => {
      setMonitorResult({ responseTime: 150 })
      await service.processHeatCheck()

      const stats = await service.getStats()

      expect(stats.totalChecks).toBe(1)
      expect(stats.successfulChecks).toBe(1)
      expect(stats.failedChecks).toBe(0)
      expect(stats.uptimePercentage).toBe(100)
      expect(stats.averageResponseTime).toBe(150)
      expect(stats.currentStatus).toBe('up')
      expect(stats.lastCheckTime).toBeGreaterThan(0)
      expect(stats.incidents).toEqual([])
    })

    test('calculates stats for multiple successful checks', async () => {
      const responseTimes = [100, 150, 200, 120, 180]

      for (const responseTime of responseTimes) {
        setMonitorResult({ responseTime })
        await service.processHeatCheck()
      }

      const stats = await service.getStats()

      expect(stats.totalChecks).toBe(5)
      expect(stats.successfulChecks).toBe(5)
      expect(stats.failedChecks).toBe(0)
      expect(stats.uptimePercentage).toBe(100)
      // Average: (100 + 150 + 200 + 120 + 180) / 5 = 150
      expect(stats.averageResponseTime).toBe(150)
      expect(stats.currentStatus).toBe('up')
      expect(stats.incidents).toEqual([])
    })

    test('calculates stats with mixed success and failures', async () => {
      // 7 successful, 3 failed = 70% uptime
      const checks = [
        { responseTime: 100 },
        { responseTime: 120 },
        { up: false, err: 'Timeout', statusCode: null },
        { responseTime: 110 },
        { up: false, err: 'Timeout', statusCode: null },
        { responseTime: 130 },
        { responseTime: 140 },
        { up: false, err: 'Timeout', statusCode: null },
        { responseTime: 150 },
        { responseTime: 160 },
      ]

      for (const check of checks) {
        setMonitorResult(check)
        await service.processHeatCheck()
      }

      const stats = await service.getStats()

      expect(stats.totalChecks).toBe(10)
      expect(stats.successfulChecks).toBe(7)
      expect(stats.failedChecks).toBe(3)
      expect(stats.uptimePercentage).toBe(70)
      expect(stats.currentStatus).toBe('up') // Most recent is success
    })

    test('identifies current status as down when last check failed', async () => {
      // Success then failure
      setMonitorResult()
      await service.processHeatCheck()

      setMonitorFailure()
      await service.processHeatCheck()

      const stats = await service.getStats()

      expect(stats.currentStatus).toBe('down')
      expect(stats.totalChecks).toBe(2)
    })

    test('calculates incidents from consecutive failures', async () => {
      // Pattern: success, fail (incident 1), fail, success, success, fail (incident 2), success
      const checks = [
        {},
        { up: false, err: 'Error 1', statusCode: 500 },
        { up: false, err: 'Error 2', statusCode: 500 },
        {},
        {},
        { up: false, err: 'Error 3', statusCode: 503 },
        {},
      ]

      for (const check of checks) {
        setMonitorResult(check)
        await service.processHeatCheck()
        // Small delay to ensure timestamp ordering
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      const stats = await service.getStats()

      expect(stats.incidents.length).toBe(2)

      // Most recent incident first
      expect(stats.incidents[0].errorMessage).toBe('Error 3')
      expect(stats.incidents[0].endTime).not.toBeNull()

      expect(stats.incidents[1].errorMessage).toBe('Error 1')
      expect(stats.incidents[1].endTime).not.toBeNull()
    })

    test('identifies ongoing incident', async () => {
      // Pattern: success, fail, fail (ongoing)
      const checks = [
        {},
        { up: false, err: 'Error', statusCode: 500 },
        { up: false, err: 'Error', statusCode: 500 },
      ]

      for (const check of checks) {
        setMonitorResult(check)
        await service.processHeatCheck()
      }

      const stats = await service.getStats()

      expect(stats.incidents.length).toBe(1)
      expect(stats.incidents[0].endTime).toBeNull() // Ongoing
      expect(stats.incidents[0].errorMessage).toBe('Error')
    })

    test('getStats with custom time range', async () => {
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000)

      // Add checks with specific timestamps
      // 3 checks 2 hours ago
      for (let i = 0; i < 3; i++) {
        await repo.save(
          {
            up: true,
            responseTime: 100,
            err: null,
            statusCode: 200,
            consecutiveFailures: 0,
          },
          new Date(twoHoursAgo.getTime() + i * 1000),
        )
      }

      // 2 checks 1 hour ago
      for (let i = 0; i < 2; i++) {
        await repo.save(
          {
            up: true,
            responseTime: 100,
            err: null,
            statusCode: 200,
            consecutiveFailures: 0,
          },
          new Date(oneHourAgo.getTime() + i * 1000),
        )
      }

      // Query only last hour (should get 2 checks)
      const stats = await service.getStats(oneHourAgo, now)

      expect(stats.totalChecks).toBe(2)
      expect(stats.successfulChecks).toBe(2)
    })
  })

  describe('edge cases', () => {
    test('repository persistence - consecutive failures survive across service instances', async () => {
      // Fail 2 times
      setMonitorFailure()
      await service.processHeatCheck()
      await service.processHeatCheck()

      // Create new service instance with same repo
      const newService = createHealthCheckService({
        repo, // Same repo!
        config: defaultConfig,
        monitor: { check: monitorCheckMock },
        notificationHandlers: [
          {
            sendDownNotification: sendDownNotificationMock,
            sendUpNotification: sendUpNotificationMock,
          },
        ],
      })

      // 3rd failure should trigger notification
      const result = await newService.processHeatCheck()

      expect(result.consecutiveFailures).toBe(3)
      expect(sendDownNotificationMock).toHaveBeenCalledTimes(1)
    })

    test('different error messages preserved in consecutive failures', async () => {
      const errors = ['Connection refused', 'Timeout', 'DNS resolution failed']

      for (let i = 0; i < 3; i++) {
        setMonitorFailure(errors[i])
        await service.processHeatCheck()
      }

      // Notification should contain the last error
      expect(sendDownNotificationMock).toHaveBeenCalledTimes(1)
      expect(sendDownNotificationMock).toHaveBeenCalledWith(
        'Test Service',
        3,
        'DNS resolution failed',
      )

      // Verify all errors stored
      const checks = await repo.latest(3)
      expect(checks[0].err).toBe('DNS resolution failed')
      expect(checks[1].err).toBe('Timeout')
      expect(checks[2].err).toBe('Connection refused')
    })
  })
})
