import alchemy from "alchemy";
import { D1Database, Worker } from "alchemy/cloudflare";
import { join } from "path";

// Enable local mode for development testing
// Set local: true to simulate resources locally where possible
// Can be overridden via CLI: bun run deploy.ts --dev (sets local=true)
const app = await alchemy("monitor-test", {
	local: true,
});

// Resolve paths from the project root
const projectRoot = join(import.meta.dir, "../..");
const workerEntrypoint = join(projectRoot, "src/index.ts");
const migrationsDir = join(projectRoot, "drizzle");

// Create D1 database with migrations
export const db = await D1Database("db", {
	name: "monitor_test_d1",
	migrationsDir: migrationsDir,
});

// Create worker
export const worker = await Worker("worker", {
	name: "monitor-test",
	entrypoint: workerEntrypoint,
	compatibilityDate: "2025-01-05",
	compatibilityFlags: ["nodejs_compat"],

	// Bindings
	bindings: {
		DB: db,
		TEST_MESSAGE: process.env.TEST_MESSAGE || "Hello from D1!",
	},
});

await app.finalize();

console.log(`✅ Deployed test monitor: ${worker.name}`);
console.log(`🗄️ Database: ${db.name}`);

// Log the actual URLs based on deployment mode
if (app.local) {
	// In local mode, Alchemy starts a dev server
	console.log(`🌐 Local URL: ${worker.url}`);
} else {
	// In production mode, worker is deployed to Cloudflare
	console.log(`🌐 Production URL: ${worker.url}`);
}
