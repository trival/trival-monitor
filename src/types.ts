/**
 * Type definitions for Trival Monitor
 */

/**
 * Raw environment variables from Cloudflare Worker
 */
export interface Env {
  DB: D1Database

  // Service configuration
  SERVICE_NAME?: string
  TARGET_URL: string
  HTTP_METHOD?: string // "GET" or "POST"

  // Timing configuration
  PING_TIMEOUT?: string // milliseconds as string

  // Grace period
  GRACE_PERIOD_FAILURES?: string // number as string

  // API security
  API_BEARER_TOKEN?: string

  // Optional HTTP config
  HTTP_HEADERS?: string // JSON string
  HTTP_BODY?: string // JSON string or plain text
  EXPECTED_CODES?: string // comma-separated or range (e.g., "200-299")

  // SMTP configuration
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  NOTIFICATION_EMAIL?: string
  NOTIFICATION_EMAIL_FROM?: string
}

/**
 * Parsed and validated monitor configuration
 */
export interface MonitorConfig {
  serviceName: string
  targetUrl: string
  httpMethod: 'GET' | 'POST'
  pingTimeout: number // milliseconds
  gracePeriodFailures: number
  expectedCodes: number[] // [200, 201, 202, ..., 299] or custom list
  headers?: Record<string, string>
  body?: string
}

/**
 * SMTP configuration for email notifications
 */
export interface SMTPConfig {
  host: string
  port: number
  user: string
  pass: string
  notificationEmail: string
  fromEmail: string
}

/**
 * Application configuration (includes DB and API security)
 */
export interface AppConfig {
  monitor: MonitorConfig
  apiBearerToken: string
  smtp?: SMTPConfig // Optional SMTP configuration
}

/**
 * Result of a single health check
 */
export interface HealthCheckResult {
  up: boolean
  responseTime: number // milliseconds
  err: string | null
  statusCode: number | null
  consecutiveFailures: number
}

/**
 * Statistics for any time range
 */
export interface Stats {
  totalChecks: number
  successfulChecks: number
  failedChecks: number
  uptimePercentage: number // 0-100
  averageResponseTime: number // milliseconds
  currentStatus: 'up' | 'down'
  lastCheckTime: string // ISO string
  incidents: Incident[]
}

/**
 * An incident (period of consecutive failures)
 */
export interface Incident {
  startTime: string // ISO string
  endTime: string | null // null if still ongoing
  durationMinutes: number // minutes
  errorMessage: string
}
