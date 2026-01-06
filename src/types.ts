/**
 * Type definitions for Trival Monitor
 */

/**
 * Raw environment variables from Cloudflare Worker
 */
export interface Env {
	DB: D1Database;

	// Service configuration
	SERVICE_NAME?: string;
	TARGET_URL: string;
	HTTP_METHOD?: string; // "GET" or "POST"

	// Timing configuration
	PING_TIMEOUT?: string; // milliseconds as string
	CHECK_INTERVAL_SECONDS?: string; // seconds as string

	// Grace period
	GRACE_PERIOD_FAILURES?: string; // number as string

	// API security
	API_BEARER_TOKEN?: string;

	// Optional HTTP config (Stage 5)
	HTTP_HEADERS?: string; // JSON string
	HTTP_BODY?: string; // JSON string or plain text
	EXPECTED_CODES?: string; // comma-separated or range (e.g., "200-299")
}

/**
 * Parsed and validated monitor configuration
 */
export interface MonitorConfig {
	serviceName: string;
	targetUrl: string;
	httpMethod: "GET" | "POST";
	pingTimeout: number; // milliseconds
	gracePeriodFailures: number;
	checkIntervalSeconds: number;
	expectedCodes: number[]; // [200, 201, 202, ..., 299] or custom list
	headers?: Record<string, string>;
	body?: string;
}

/**
 * Application configuration (includes DB and API security)
 */
export interface AppConfig {
	monitor: MonitorConfig;
	apiBearerToken: string;
}

/**
 * Result of a single health check
 */
export interface HealthCheckResult {
	up: boolean;
	ping: number; // milliseconds
	err: string | null;
	statusCode: number | null;
	consecutiveFailures: number;
}

/**
 * Statistics for any time range
 */
export interface Stats {
	totalChecks: number;
	successfulChecks: number;
	failedChecks: number;
	uptimePercentage: number; // 0-100
	averageResponseTime: number; // milliseconds
	currentStatus: "up" | "down";
	lastCheckTime: number; // Unix timestamp
	incidents: Incident[];
}

/**
 * An incident (period of consecutive failures)
 */
export interface Incident {
	startTime: number; // Unix timestamp
	endTime: number | null; // null if still ongoing
	duration: number; // minutes
	errorMessage: string;
}
