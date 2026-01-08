import { describe, expect, test } from 'bun:test'
import { parseConfig } from '../src/config'
import type { Env } from '../src/types'

describe('parseConfig', () => {
  const baseEnv: Env = {
    DB: {} as D1Database,
    TARGET_URL: 'https://example.com',
    API_BEARER_TOKEN: 'test-token-123',
  }

  test('parses minimal configuration with defaults', () => {
    const config = parseConfig(baseEnv)

    expect(config.monitor.serviceName).toBe('Service')
    expect(config.monitor.targetUrl).toBe('https://example.com')
    expect(config.monitor.httpMethod).toBe('GET')
    expect(config.monitor.pingTimeout).toBe(10000)
    expect(config.monitor.gracePeriodFailures).toBe(3)
    expect(config.apiBearerToken).toBe('test-token-123')
  })

  test('throws error if TARGET_URL is missing', () => {
    const env = { ...baseEnv, TARGET_URL: undefined } as any
    expect(() => parseConfig(env)).toThrow(
      'TARGET_URL environment variable is required',
    )
  })

  test('throws error if API_BEARER_TOKEN is missing', () => {
    const env = { ...baseEnv, API_BEARER_TOKEN: undefined } as any
    expect(() => parseConfig(env)).toThrow(
      'API_BEARER_TOKEN environment variable is required',
    )
  })

  test('parses custom SERVICE_NAME', () => {
    const env = { ...baseEnv, SERVICE_NAME: 'My Service' }
    const config = parseConfig(env)
    expect(config.monitor.serviceName).toBe('My Service')
  })

  test('parses HTTP_METHOD POST', () => {
    const env = { ...baseEnv, HTTP_METHOD: 'POST' }
    const config = parseConfig(env)
    expect(config.monitor.httpMethod).toBe('POST')
  })

  test('defaults to GET for invalid HTTP_METHOD', () => {
    const env = { ...baseEnv, HTTP_METHOD: 'PUT' }
    const config = parseConfig(env)
    expect(config.monitor.httpMethod).toBe('GET')
  })

  test('parses PING_TIMEOUT', () => {
    const env = { ...baseEnv, PING_TIMEOUT: '5000' }
    const config = parseConfig(env)
    expect(config.monitor.pingTimeout).toBe(5000)
  })

  test('throws error for invalid PING_TIMEOUT', () => {
    const env = { ...baseEnv, PING_TIMEOUT: '0' }
    expect(() => parseConfig(env)).toThrow(
      'PING_TIMEOUT must be between 1 and 60000 milliseconds',
    )

    const env2 = { ...baseEnv, PING_TIMEOUT: '70000' }
    expect(() => parseConfig(env2)).toThrow(
      'PING_TIMEOUT must be between 1 and 60000 milliseconds',
    )
  })

  test('parses GRACE_PERIOD_FAILURES', () => {
    const env = { ...baseEnv, GRACE_PERIOD_FAILURES: '5' }
    const config = parseConfig(env)
    expect(config.monitor.gracePeriodFailures).toBe(5)
  })

  test('throws error for invalid GRACE_PERIOD_FAILURES', () => {
    const env = { ...baseEnv, GRACE_PERIOD_FAILURES: '0' }
    expect(() => parseConfig(env)).toThrow(
      'GRACE_PERIOD_FAILURES must be between 1 and 10',
    )

    const env2 = { ...baseEnv, GRACE_PERIOD_FAILURES: '11' }
    expect(() => parseConfig(env2)).toThrow(
      'GRACE_PERIOD_FAILURES must be between 1 and 10',
    )
  })

  describe('EXPECTED_CODES parsing', () => {
    test('defaults to 2xx range (200-299)', () => {
      const config = parseConfig(baseEnv)
      expect(config.monitor.expectedCodes.length).toBe(100) // 200-299 is 100 codes
      expect(config.monitor.expectedCodes[0]).toBe(200)
      expect(config.monitor.expectedCodes[99]).toBe(299)
    })

    test('parses range notation', () => {
      const env = { ...baseEnv, EXPECTED_CODES: '200-204' }
      const config = parseConfig(env)
      expect(config.monitor.expectedCodes).toEqual([200, 201, 202, 203, 204])
    })

    test('parses comma-separated list', () => {
      const env = { ...baseEnv, EXPECTED_CODES: '200,301,302' }
      const config = parseConfig(env)
      expect(config.monitor.expectedCodes).toEqual([200, 301, 302])
    })

    test('parses comma-separated list with spaces', () => {
      const env = { ...baseEnv, EXPECTED_CODES: '200  , 301,  302' }
      const config = parseConfig(env)
      expect(config.monitor.expectedCodes).toEqual([200, 301, 302])
    })

    test('throws error for invalid range', () => {
      const env = { ...baseEnv, EXPECTED_CODES: '299-200' }
      expect(() => parseConfig(env)).toThrow('Invalid expected codes range')
    })

    test('throws error for invalid codes in list', () => {
      const env = { ...baseEnv, EXPECTED_CODES: '200,abc,302' }
      expect(() => parseConfig(env)).toThrow('Invalid expected codes')
    })
  })

  test('parses HTTP_HEADERS JSON', () => {
    const env = {
      ...baseEnv,
      HTTP_HEADERS: '{"Authorization":"Bearer token"}',
    }
    const config = parseConfig(env)
    expect(config.monitor.headers).toEqual({ Authorization: 'Bearer token' })
  })

  test('throws error for invalid HTTP_HEADERS JSON', () => {
    const env = { ...baseEnv, HTTP_HEADERS: 'not valid json' }
    expect(() => parseConfig(env)).toThrow('HTTP_HEADERS must be valid JSON')
  })

  test('parses HTTP_BODY', () => {
    const env = { ...baseEnv, HTTP_BODY: '{"check":"health"}' }
    const config = parseConfig(env)
    expect(config.monitor.body).toBe('{"check":"health"}')
  })

  describe('SMTP configuration', () => {
    test('returns undefined smtp when SMTP_HOST is not provided', () => {
      const config = parseConfig(baseEnv)
      expect(config.smtp).toBeUndefined()
    })

    test('parses complete SMTP configuration', () => {
      const env = {
        ...baseEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '587',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'password123',
        NOTIFICATION_EMAIL: 'alerts@example.com',
      }
      const config = parseConfig(env)

      expect(config.smtp).toBeDefined()
      expect(config.smtp?.host).toBe('smtp.gmail.com')
      expect(config.smtp?.port).toBe(587)
      expect(config.smtp?.user).toBe('user@example.com')
      expect(config.smtp?.pass).toBe('password123')
      expect(config.smtp?.notificationEmail).toBe('alerts@example.com')
      expect(config.smtp?.fromEmail).toBe('user@example.com') // defaults to SMTP_USER
    })

    test('uses NOTIFICATION_EMAIL_FROM when provided', () => {
      const env = {
        ...baseEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'password123',
        NOTIFICATION_EMAIL: 'alerts@example.com',
        NOTIFICATION_EMAIL_FROM: 'monitoring@example.com',
      }
      const config = parseConfig(env)

      expect(config.smtp?.fromEmail).toBe('monitoring@example.com')
    })

    test('defaults SMTP_PORT to 587', () => {
      const env = {
        ...baseEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'password123',
        NOTIFICATION_EMAIL: 'alerts@example.com',
      }
      const config = parseConfig(env)

      expect(config.smtp?.port).toBe(587)
    })

    test('throws error if SMTP_HOST is set but SMTP_USER is missing', () => {
      const env = {
        ...baseEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PASS: 'password123',
        NOTIFICATION_EMAIL: 'alerts@example.com',
      }
      expect(() => parseConfig(env)).toThrow(
        'SMTP configuration incomplete: SMTP_USER, SMTP_PASS, and NOTIFICATION_EMAIL are required when SMTP_HOST is set',
      )
    })

    test('throws error if SMTP_HOST is set but SMTP_PASS is missing', () => {
      const env = {
        ...baseEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_USER: 'user@example.com',
        NOTIFICATION_EMAIL: 'alerts@example.com',
      }
      expect(() => parseConfig(env)).toThrow(
        'SMTP configuration incomplete: SMTP_USER, SMTP_PASS, and NOTIFICATION_EMAIL are required when SMTP_HOST is set',
      )
    })

    test('throws error if SMTP_HOST is set but NOTIFICATION_EMAIL is missing', () => {
      const env = {
        ...baseEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'password123',
      }
      expect(() => parseConfig(env)).toThrow(
        'SMTP configuration incomplete: SMTP_USER, SMTP_PASS, and NOTIFICATION_EMAIL are required when SMTP_HOST is set',
      )
    })

    test('throws error for invalid SMTP_PORT', () => {
      const env = {
        ...baseEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '0',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'password123',
        NOTIFICATION_EMAIL: 'alerts@example.com',
      }
      expect(() => parseConfig(env)).toThrow('SMTP_PORT must be between 1 and 65535')
    })

    test('throws error for SMTP_PORT above 65535', () => {
      const env = {
        ...baseEnv,
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '70000',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'password123',
        NOTIFICATION_EMAIL: 'alerts@example.com',
      }
      expect(() => parseConfig(env)).toThrow('SMTP_PORT must be between 1 and 65535')
    })
  })
})
