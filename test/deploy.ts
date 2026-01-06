import alchemy from "alchemy";
import { D1Database, Worker } from "alchemy/cloudflare";
import { join } from "path";

// Enable local mode for testing
const app = await alchemy("monitor-test-stage2", {
	local: true,
});

// Resolve paths
const projectRoot = join(import.meta.dir, "..");
const migrationsDir = join(projectRoot, "drizzle");

// Create D1 database with migrations
export const db = await D1Database("db", {
	name: "monitor_test_stage2_d1",
	migrationsDir: migrationsDir,
});

// Deploy MOCK TARGET worker (controllable test fixture)
export const mockTarget = await Worker("mock-target", {
	name: "mock-target-test",
	entrypoint: join(import.meta.dir, "fixtures/mock-target.ts"),
	compatibilityDate: "2025-01-05",
});

// Deploy MONITOR worker (the actual service)
// Configure cron trigger - standard cron format (minute-level granularity)
// Cloudflare Workers cron triggers use standard 5-field cron syntax
const cronSchedule = "* * * * *"; // Every minute

// Type-safe bindings that match our Env interface

export const monitor = await Worker("monitor", {
	name: "monitor-test-stage2",
	entrypoint: join(projectRoot, "src/index.ts"),
	compatibilityDate: "2025-01-05",
	compatibilityFlags: ["nodejs_compat"], // Needed for Stage 3 SMTP

	// Bindings
	bindings: {
		DB: db,
		TARGET_URL: mockTarget.url!, // Point to mock target (dynamic URL)
		SERVICE_NAME: "Test Service",
		PING_TIMEOUT: "5000",
		GRACE_PERIOD_FAILURES: "3",
		API_BEARER_TOKEN: "test-token-12345",
		HTTP_METHOD: "GET",
	},

	// Add cron trigger for scheduled checks
	crons: [cronSchedule],
});

await app.finalize();

console.log(`✅ Deployed monitor test (Stage 2)`);
console.log(`🎯 Mock Target: ${mockTarget.url}`);
console.log(`📊 Monitor: ${monitor.url}`);
console.log(`⏱️  Cron Schedule: ${cronSchedule} (every minute)`);
