import alchemy from "alchemy";
import { Worker, D1Database } from "alchemy/cloudflare";

const app = await alchemy("monitor-test");

// Create D1 database
const db = await D1Database("db", {
	name: "monitor_test_d1",
});

// Create worker
const worker = await Worker("worker", {
	name: "monitor-test",
	entrypoint: "../../src/index.ts",
	compatibilityDate: "2025-01-05",

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
