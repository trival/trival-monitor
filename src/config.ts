import type { AppConfig, Env, MonitorConfig } from './types'

/**
 * Parse expected codes from string format
 * Supports range notation "200-299" or comma-separated list "200,301,302"
 */
function parseExpectedCodes(codesStr: string): number[] {
  // Handle range notation: "200-299"
  if (codesStr.includes('-')) {
    const [start, end] = codesStr.split('-').map((s) => parseInt(s.trim(), 10))
    if (isNaN(start) || isNaN(end) || start > end) {
      throw new Error(`Invalid expected codes range: ${codesStr}`)
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }

  // Handle comma-separated list: "200,301,302"
  const codes = codesStr.split(',').map((c) => parseInt(c.trim(), 10))
  if (codes.some((c) => isNaN(c))) {
    throw new Error(`Invalid expected codes: ${codesStr}`)
  }
  return codes
}

/**
 * Parse and validate environment variables into typed configuration
 */
export function parseConfig(env: Env): AppConfig {
  // Validate required fields
  if (!env.TARGET_URL) {
    throw new Error('TARGET_URL environment variable is required')
  }

  if (!env.API_BEARER_TOKEN) {
    throw new Error('API_BEARER_TOKEN environment variable is required')
  }

  // Parse numeric values
  const pingTimeout = parseInt(env.PING_TIMEOUT || '10000', 10)
  const gracePeriodFailures = parseInt(env.GRACE_PERIOD_FAILURES || '3', 10)

  // Validate ping timeout
  if (isNaN(pingTimeout) || pingTimeout <= 0 || pingTimeout > 60000) {
    throw new Error('PING_TIMEOUT must be between 1 and 60000 milliseconds')
  }

  // Validate grace period
  if (
    isNaN(gracePeriodFailures) ||
    gracePeriodFailures < 1 ||
    gracePeriodFailures > 10
  ) {
    throw new Error('GRACE_PERIOD_FAILURES must be between 1 and 10')
  }

  // Parse HTTP method
  const httpMethod = env.HTTP_METHOD?.toUpperCase() === 'POST' ? 'POST' : 'GET'

  // Parse expected codes (default to 2xx range)
  const expectedCodes = env.EXPECTED_CODES
    ? parseExpectedCodes(env.EXPECTED_CODES)
    : parseExpectedCodes('200-299')

  // Parse optional headers
  let headers: Record<string, string> | undefined
  if (env.HTTP_HEADERS) {
    try {
      headers = JSON.parse(env.HTTP_HEADERS)
    } catch (error) {
      throw new Error('HTTP_HEADERS must be valid JSON')
    }
  }

  const monitorConfig: MonitorConfig = {
    serviceName: env.SERVICE_NAME || 'Service',
    targetUrl: env.TARGET_URL,
    httpMethod,
    pingTimeout,
    gracePeriodFailures,
    expectedCodes,
    headers,
    body: env.HTTP_BODY,
  }

  // Parse optional SMTP configuration
  let smtpConfig = undefined
  if (env.SMTP_HOST) {
    // SMTP_HOST is present, validate all required SMTP fields
    if (!env.SMTP_USER || !env.SMTP_PASS || !env.NOTIFICATION_EMAIL) {
      throw new Error(
        'SMTP configuration incomplete: SMTP_USER, SMTP_PASS, and NOTIFICATION_EMAIL are required when SMTP_HOST is set',
      )
    }

    const smtpPort = parseInt(env.SMTP_PORT || '587', 10)
    if (isNaN(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      throw new Error('SMTP_PORT must be between 1 and 65535')
    }

    smtpConfig = {
      host: env.SMTP_HOST,
      port: smtpPort,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      notificationEmail: env.NOTIFICATION_EMAIL,
      fromEmail: env.NOTIFICATION_EMAIL_FROM || env.SMTP_USER,
    }
  }

  return {
    monitor: monitorConfig,
    apiBearerToken: env.API_BEARER_TOKEN,
    smtp: smtpConfig,
  }
}
