import { and, desc, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { HealthCheckResult, Incident, Stats } from "../types";
import { HealthCheck, healthChecks } from "./schema";

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema: { healthChecks } });
}

type DbInstance = ReturnType<typeof createDb>;

/**
 * Save a health check result to the database
 */
export async function saveHealthCheck(
	db: DbInstance,
	result: HealthCheckResult
): Promise<void> {
	await db.insert(healthChecks).values({
		up: result.up,
		ping: result.ping,
		err: result.err,
		statusCode: result.statusCode,
		consecutiveFailures: result.consecutiveFailures,
		timestamp: new Date(), // Drizzle handles conversion
	});
}

/**
 * Get recent health checks (for debugging/testing)
 */
export async function getRecentChecks(db: DbInstance, limit = 10) {
	return await db.query.healthChecks.findMany({
		orderBy: [desc(healthChecks.timestamp)],
		limit,
	});
}

/**
 * Get the count of consecutive failures leading up to now
 * This is crucial for grace period logic
 */
export async function getConsecutiveFailures(db: DbInstance): Promise<number> {
	// Get the most recent check - it has the consecutiveFailures count
	const recentChecks = await getRecentChecks(db, 1);

	if (recentChecks.length === 0) {
		return 0;
	}

	return recentChecks[0].consecutiveFailures;
}

/**
 * Calculate statistics for any time range
 * Defaults: endTime = now, startTime = now - 24h
 */
export async function getStats(
	db: DbInstance,
	startTime?: number,
	endTime?: number
): Promise<Stats> {
	const now = Date.now();
	const end = endTime || now;
	const start = startTime || now - 24 * 60 * 60 * 1000; // 24 hours ago

	// Get all checks in time range using both start and end conditions
	const filteredChecks = await db.query.healthChecks.findMany({
		where: and(
			gte(healthChecks.timestamp, new Date(start)),
			lte(healthChecks.timestamp, new Date(end))
		),
		orderBy: [desc(healthChecks.timestamp)],
	});

	if (filteredChecks.length === 0) {
		return {
			totalChecks: 0,
			successfulChecks: 0,
			failedChecks: 0,
			uptimePercentage: 0,
			averageResponseTime: 0,
			currentStatus: "down",
			lastCheckTime: 0,
			incidents: [],
		};
	}

	// Calculate basic stats
	const successfulChecks = filteredChecks.filter((c) => c.up).length;
	const failedChecks = filteredChecks.length - successfulChecks;
	const uptimePercentage = (successfulChecks / filteredChecks.length) * 100;

	const totalResponseTime = filteredChecks.reduce((sum, c) => sum + c.ping, 0);
	const averageResponseTime = Math.round(
		totalResponseTime / filteredChecks.length
	);

	// Current status from most recent check
	const currentStatus = filteredChecks[0].up ? "up" : "down";
	const lastCheckTime = Math.floor(
		filteredChecks[0].timestamp.getTime() / 1000
	);

	// Calculate incidents (periods of consecutive failures)
	const incidents = calculateIncidents(filteredChecks);

	return {
		totalChecks: filteredChecks.length,
		successfulChecks,
		failedChecks,
		uptimePercentage: Math.round(uptimePercentage * 100) / 100,
		averageResponseTime,
		currentStatus,
		lastCheckTime,
		incidents,
	};
}

/**
 * Helper function to extract incidents from checks
 */
function calculateIncidents(checks: HealthCheck[]): Incident[] {
	const incidents: Incident[] = [];
	let currentIncident: Incident | null = null;

	// Process checks in chronological order (oldest first)
	const chronologicalChecks = [...checks].reverse();

	for (const check of chronologicalChecks) {
		const checkTime = Math.floor(check.timestamp.getTime() / 1000);

		if (!check.up) {
			// Start new incident if not already tracking one
			if (!currentIncident) {
				currentIncident = {
					startTime: checkTime,
					endTime: null,
					duration: 0,
					errorMessage: check.err || "Unknown error",
				};
			}
		} else {
			// End current incident if one exists
			if (currentIncident) {
				currentIncident.endTime = checkTime;
				currentIncident.duration = Math.round(
					(currentIncident.endTime - currentIncident.startTime) / 60
				);
				incidents.push(currentIncident);
				currentIncident = null;
			}
		}
	}

	// If incident is still ongoing, add it
	if (currentIncident) {
		const now = Math.floor(Date.now() / 1000);
		currentIncident.duration = Math.round(
			(now - currentIncident.startTime) / 60
		);
		incidents.push(currentIncident);
	}

	return incidents.reverse(); // Most recent first
}
