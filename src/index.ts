import { parseConfig } from "./config";
import {
	createDb,
	getConsecutiveFailures,
	getStats,
	saveHealthCheck,
} from "./db/queries";
import { checkTarget } from "./monitor";
import type { Env, HealthCheckResult } from "./types";

/**
 * Helper function to check bearer token authentication
 */
function checkAuth(request: Request, expectedToken: string): boolean {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader) {
		return false;
	}

	const token = authHeader.replace("Bearer ", "");
	return token === expectedToken;
}

export default {
	/**
	 * Scheduled handler - runs on cron trigger
	 */
	async scheduled(
		event: ScheduledEvent,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		console.log("[SCHEDULED] Running scheduled health check");

		const config = parseConfig(env);
		const db = createDb(env.DB);

		try {
			// Perform health check
			const checkResult = await checkTarget(config.monitor);

			// Get consecutive failures count from database
			const consecutiveFailures = await getConsecutiveFailures(db);

			// Calculate new consecutive failures count
			let newConsecutiveFailures: number;
			if (checkResult.up) {
				// Success resets counter
				newConsecutiveFailures = 0;
			} else {
				// Increment on failure
				newConsecutiveFailures = consecutiveFailures + 1;
			}

			// Save result with consecutive failures count
			const result: HealthCheckResult = {
				...checkResult,
				consecutiveFailures: newConsecutiveFailures,
			};

			await saveHealthCheck(db, result);

			// Grace period logic (console.log only in Stage 2)
			if (
				!checkResult.up &&
				newConsecutiveFailures === config.monitor.gracePeriodFailures
			) {
				console.log(
					`[ALERT] ${config.monitor.serviceName} is DOWN - ${newConsecutiveFailures} consecutive failures - Last error: ${checkResult.err}`
				);
				// TODO Stage 3: Call sendDownNotification() here
			} else if (checkResult.up && consecutiveFailures > 0) {
				console.log(
					`[RECOVERY] ${config.monitor.serviceName} is UP - Was down for ${consecutiveFailures} checks`
				);
				// TODO Stage 3: Call sendUpNotification() here
			}
		} catch (error: any) {
			console.error("[SCHEDULED ERROR]", error.message);
			// Don't throw - worker should not crash on monitoring errors
		}
	},

	/**
	 * HTTP request handler - serves API endpoints
	 * ALL endpoints require bearer token authentication
	 */
	async fetch(request: Request, env: Env): Promise<Response> {
		console.log(`[HTTP] ${request.method} ${request.url}`);

		const url = new URL(request.url);

		// Parse config (may throw if required vars missing)
		let config;
		try {
			config = parseConfig(env);
		} catch (error: any) {
			return Response.json(
				{ error: "Configuration error", message: error.message },
				{ status: 500 }
			);
		}

		const db = createDb(env.DB);

		// Check bearer token authentication for ALL endpoints
		if (!checkAuth(request, config.apiBearerToken)) {
			return new Response("Unauthorized", { status: 401 });
		}

		// GET / - Service info and health check
		if (url.pathname === "/" && request.method === "GET") {
			try {
				const stats = await getStats(db);
				return Response.json({
					service: config.monitor.serviceName,
					target: config.monitor.targetUrl,
					status: stats.currentStatus,
					lastCheck: stats.lastCheckTime,
				});
			} catch (error: any) {
				return Response.json(
					{ error: "Failed to get service info", message: error.message },
					{ status: 500 }
				);
			}
		}

		// GET /stats - Get statistics (with optional time range)
		if (url.pathname === "/stats" && request.method === "GET") {
			try {
				// Parse optional query parameters for custom time range
				const startParam = url.searchParams.get("start");
				const endParam = url.searchParams.get("end");

				const startTime = startParam ? parseInt(startParam, 10) : undefined;
				const endTime = endParam ? parseInt(endParam, 10) : undefined;

				const stats = await getStats(db, startTime, endTime);
				return Response.json(stats);
			} catch (error: any) {
				return Response.json(
					{ error: "Failed to fetch statistics", message: error.message },
					{ status: 500 }
				);
			}
		}

		// POST /trigger-check - Manually trigger a health check
		if (url.pathname === "/trigger-check" && request.method === "POST") {
			try {
				const checkResult = await checkTarget(config.monitor);
				const consecutiveFailures = await getConsecutiveFailures(db);

				const newConsecutiveFailures = checkResult.up
					? 0
					: consecutiveFailures + 1;

				const result: HealthCheckResult = {
					...checkResult,
					consecutiveFailures: newConsecutiveFailures,
				};

				await saveHealthCheck(db, result);

				return Response.json({
					success: true,
					result,
					message: `Check completed. Status: ${checkResult.up ? "UP" : "DOWN"}`,
				});
			} catch (error: any) {
				return Response.json(
					{ error: "Failed to perform check", message: error.message },
					{ status: 500 }
				);
			}
		}

		// 404 for unknown routes
		return new Response("Not Found", { status: 404 });
	},
};
