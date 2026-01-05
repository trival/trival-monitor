import alchemy from "alchemy";
import { Worker, D1Database } from "alchemy/cloudflare";
import { join } from "path";

// Enable local mode for development testing
// Set local: true to simulate resources locally where possible
// Can be overridden via CLI: bun run deploy.ts --dev (sets local=true)
const app = await alchemy("monitor-test", {
	local: true,
});

// Create D1 database
export const db = await D1Database("db", {
	name: "monitor_test_d1",
});

// Resolve the worker entrypoint path from the project root
const projectRoot = join(import.meta.dir, "../..");
const workerEntrypoint = join(projectRoot, "src/index.ts");

// Create worker
const worker = await Worker("worker", {
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
console.log(`🌐 Worker URL: https://${worker.name}.workers.dev`);
console.log(`🗄️ Database: ${db.name}`);
console.log(`\nNext steps:`);
console.log(`1. Apply D1 migrations: bun run db:push`);
console.log(`2. Test the endpoint: curl https://${worker.name}.workers.dev`);
