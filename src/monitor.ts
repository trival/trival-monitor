import type { MonitorConfig } from "./types";

export interface CheckResult {
	up: boolean;
	ping: number;
	err: string | null;
	statusCode: number | null;
}

/**
 * Perform HTTP health check with timeout
 * Pattern adapted from uptimeflare's fetchTimeout implementation
 */
export async function checkTarget(config: MonitorConfig): Promise<CheckResult> {
	const startTime = Date.now();

	try {
		// Create AbortController for timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), config.pingTimeout);

		try {
			// Perform fetch with abort signal
			const response = await fetch(config.targetUrl, {
				method: config.httpMethod,
				headers: config.headers,
				body: config.httpMethod === "POST" ? config.body : undefined,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);
			const ping = Date.now() - startTime;

			// Check if status code is expected
			const isExpectedStatus = config.expectedCodes.includes(response.status);

			if (isExpectedStatus) {
				return {
					up: true,
					ping,
					err: null,
					statusCode: response.status,
				};
			} else {
				return {
					up: false,
					ping,
					err: `Unexpected status code: ${response.status}`,
					statusCode: response.status,
				};
			}
		} catch (fetchError: any) {
			clearTimeout(timeoutId);

			// Check if it's a timeout
			if (fetchError.name === "AbortError") {
				return {
					up: false,
					ping: config.pingTimeout,
					err: `Timeout after ${config.pingTimeout}ms`,
					statusCode: null,
				};
			}

			// Other fetch errors (DNS, connection refused, etc.)
			const ping = Date.now() - startTime;
			return {
				up: false,
				ping,
				err: fetchError.message || "Fetch failed",
				statusCode: null,
			};
		}
	} catch (error: any) {
		// Unexpected errors
		const ping = Date.now() - startTime;
		return {
			up: false,
			ping,
			err: error.message || "Unknown error",
			statusCode: null,
		};
	}
}
