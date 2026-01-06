import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Stats } from "../src/types";

describe("Stage 2: Core Monitoring Logic", () => {
	let monitorUrl: string;
	let mockTargetUrl: string;
	const bearerToken = "test-token-12345";

	beforeAll(async () => {
		const deployment = await import("./deploy");

		monitorUrl = deployment.monitor.url!;
		mockTargetUrl = deployment.mockTarget.url!;
	});

	beforeEach(async () => {
		// Reset mock target to default configuration
		await fetch(`${mockTargetUrl}/configure`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: 200, delay: 0, message: "OK" }),
		});
	});

	test("root endpoint requires bearer token", async () => {
		// No token
		const noToken = await fetch(monitorUrl);
		expect(noToken.status).toBe(401);

		// Wrong token
		const wrongToken = await fetch(monitorUrl, {
			headers: { Authorization: "Bearer wrong-token" },
		});
		expect(wrongToken.status).toBe(401);

		// Correct token
		const correctToken = await fetch(monitorUrl, {
			headers: { Authorization: `Bearer ${bearerToken}` },
		});
		expect(correctToken.status).toBe(200);
	});

	test("/stats endpoint requires bearer token", async () => {
		// No token
		const noToken = await fetch(`${monitorUrl}/stats`);
		expect(noToken.status).toBe(401);

		// Correct token
		const correctToken = await fetch(`${monitorUrl}/stats`, {
			headers: { Authorization: `Bearer ${bearerToken}` },
		});
		expect(correctToken.status).toBe(200);
	});

	test("/trigger-check endpoint requires bearer token", async () => {
		// No token
		const noToken = await fetch(`${monitorUrl}/trigger-check`, {
			method: "POST",
		});
		expect(noToken.status).toBe(401);

		// Correct token
		const correctToken = await fetch(`${monitorUrl}/trigger-check`, {
			method: "POST",
			headers: { Authorization: `Bearer ${bearerToken}` },
		});
		expect(correctToken.status).toBe(200);
	});

	test("root endpoint returns service info", async () => {
		const response = await fetch(monitorUrl, {
			headers: { Authorization: `Bearer ${bearerToken}` },
		});

		expect(response.status).toBe(200);
		const data = await response.json();

		expect(data).toHaveProperty("service");
		expect(data).toHaveProperty("target");
		expect(data).toHaveProperty("status");
		expect(data).toHaveProperty("lastCheck");
		expect(data.service).toBe("Test Service");
	});

	test("trigger manual health check works", async () => {
		const response = await fetch(`${monitorUrl}/trigger-check`, {
			method: "POST",
			headers: { Authorization: `Bearer ${bearerToken}` },
		});

		expect(response.status).toBe(200);
		const data = await response.json();

		expect(data.success).toBe(true);
		expect(data).toHaveProperty("result");
		expect(data.result).toHaveProperty("up");
		expect(data.result).toHaveProperty("ping");
		expect(data.result).toHaveProperty("statusCode");
		expect(data.result.up).toBe(true);
		expect(data.result.statusCode).toBe(200);
	});

	test("monitor accepts 2xx status codes", async () => {
		let response = await fetch(`${monitorUrl}/trigger-check`, {
			method: "POST",
			headers: { Authorization: `Bearer ${bearerToken}` },
		});
		let data = await response.json();
		expect(data.result.up).toBe(true);
		expect(data.result.statusCode).toBe(200);

		// Test 201
		await fetch(`${mockTargetUrl}/configure`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: 201 }),
		});
		response = await fetch(`${monitorUrl}/trigger-check`, {
			method: "POST",
			headers: { Authorization: `Bearer ${bearerToken}` },
		});
		data = await response.json();
		expect(data.result.up).toBe(true);
		expect(data.result.statusCode).toBe(201);

		// Test 299
		await fetch(`${mockTargetUrl}/configure`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: 299 }),
		});
		response = await fetch(`${monitorUrl}/trigger-check`, {
			method: "POST",
			headers: { Authorization: `Bearer ${bearerToken}` },
		});
		data = await response.json();
		expect(data.result.up).toBe(true);
		expect(data.result.statusCode).toBe(299);

		// Test 300 (out of 2xx range)
		await fetch(`${mockTargetUrl}/configure`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: 300 }),
		});
		response = await fetch(`${monitorUrl}/trigger-check`, {
			method: "POST",
			headers: { Authorization: `Bearer ${bearerToken}` },
		});
		data = await response.json();
		expect(data.result.up).toBe(false);
		expect(data.result.statusCode).toBe(300);
	});

	test("grace period - consecutive failures increment counter", async () => {
		await fetch(`${monitorUrl}/trigger-check`, {
			method: "POST",
			headers: { Authorization: `Bearer ${bearerToken}` },
		});

		// Now configure mock to return 500 (failure)
		await fetch(`${mockTargetUrl}/configure`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: 500 }),
		});

		// Trigger 3 consecutive checks with failures
		for (let i = 1; i <= 3; i++) {
			const response = await fetch(`${monitorUrl}/trigger-check`, {
				method: "POST",
				headers: { Authorization: `Bearer ${bearerToken}` },
			});

			const data = await response.json();
			expect(data.result.consecutiveFailures).toBe(i);
			expect(data.result.up).toBe(false);

			// Small delay between checks
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	});

	test("grace period - success resets counter", async () => {
		const response = await fetch(`${monitorUrl}/trigger-check`, {
			method: "POST",
			headers: { Authorization: `Bearer ${bearerToken}` },
		});

		const data = await response.json();
		expect(data.result.consecutiveFailures).toBe(0);
		expect(data.result.up).toBe(true);
	});

	test("/stats API returns valid data structure", async () => {
		const response = await fetch(`${monitorUrl}/stats`, {
			headers: { Authorization: `Bearer ${bearerToken}` },
		});

		expect(response.status).toBe(200);

		const stats: Stats = await response.json();

		// Validate structure
		expect(stats).toHaveProperty("totalChecks");
		expect(stats).toHaveProperty("successfulChecks");
		expect(stats).toHaveProperty("failedChecks");
		expect(stats).toHaveProperty("uptimePercentage");
		expect(stats).toHaveProperty("averageResponseTime");
		expect(stats).toHaveProperty("currentStatus");
		expect(stats).toHaveProperty("lastCheckTime");
		expect(stats).toHaveProperty("incidents");

		// Validate types
		expect(typeof stats.totalChecks).toBe("number");
		expect(typeof stats.uptimePercentage).toBe("number");
		expect(Array.isArray(stats.incidents)).toBe(true);
	});

	test("/stats API with custom time range", async () => {
		const now = Date.now();
		const oneHourAgo = now - 60 * 60 * 1000;

		const response = await fetch(
			`${monitorUrl}/stats?start=${oneHourAgo}&end=${now}`,
			{
				headers: { Authorization: `Bearer ${bearerToken}` },
			}
		);

		expect(response.status).toBe(200);
		const stats: Stats = await response.json();

		expect(stats).toHaveProperty("totalChecks");
		expect(typeof stats.totalChecks).toBe("number");
	});

	// The cron schedule is configured correctly in deploy.ts (every minute) and
	// this test verifies that scheduled checks are actually being performed.
	// Note: This test may take a couple of minutes to complete due to cron timing.
	// TODO: Right now cron does not run in local Alchemy environment - needs real deployment.
	test.skip("scheduled checks run automatically via cron", async () => {
		const startTime = Date.now();

		// Wait for at least 2 minutes to see cron triggers (cron runs every minute)
		await new Promise((resolve) => setTimeout(resolve, 130000)); // 2m 10s

		const endTime = Date.now();

		// Query stats with time window to isolate checks from this test only
		const response = await fetch(
			`${monitorUrl}/stats?start=${startTime}&end=${endTime}`,
			{
				headers: { Authorization: `Bearer ${bearerToken}` },
			}
		);

		const stats: Stats = await response.json();

		// Should have at least 2 checks from scheduled cron runs (every minute)
		expect(stats.totalChecks).toBeGreaterThanOrEqual(2);
	}, 150000);
});
