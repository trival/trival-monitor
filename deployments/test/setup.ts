#!/usr/bin/env bun
import { $ } from "bun";
import { join } from "path";

console.log("🚀 Setting up test environment...\n");

// Step 1: Deploy with Alchemy (this creates the worker)
console.log("📦 Step 1: Deploying with Alchemy...");
await import("./deploy");
console.log("✅ Deployment complete\n");

// Step 1.5: Read worker URL from Alchemy output
const projectRoot = join(import.meta.dir, "../..");
const workerJsonPath = join(projectRoot, ".alchemy/monitor-test/trival/worker.json");
const workerJson = JSON.parse(await Bun.file(workerJsonPath).text());
const workerUrl = workerJson.output.url.replace(/\/$/, ""); // Remove trailing slash

console.log(`🔌 Step 1.5: Initializing database at ${workerUrl}...`);
await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for worker to be ready

try {
	// Make multiple requests to ensure D1 database file is created
	// Try a few times because the file might not be created immediately
	for (let i = 0; i < 3; i++) {
		const response = await fetch(`${workerUrl}/insert`);
		console.log(`Request ${i + 1}/3: HTTP ${response.status}`);
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	// Give the file system a moment to sync
	await new Promise((resolve) => setTimeout(resolve, 1000));
	console.log("✅ Database initialization complete\n");
} catch (error) {
	console.error("❌ Failed to initialize database:", error);
	process.exit(1);
}

// Step 2: Find the actual SQLite database file created by Alchemy
console.log("🔍 Step 2: Locating local D1 database...");
const alchemyDir = join(projectRoot, ".alchemy");
const dbPattern = "miniflare/v3/d1/**/*.sqlite";
const globber = new Bun.Glob(dbPattern);
const dbFilesRelative = Array.from(globber.scanSync({ cwd: alchemyDir }));

if (dbFilesRelative.length === 0) {
	console.error("❌ Could not find local D1 database file");
	process.exit(1);
}

const dbPath = join(alchemyDir, dbFilesRelative[0]);
console.log(`✅ Found database: ${dbPath}\n`);

// Step 3: Apply migrations using Drizzle with Bun SQLite
console.log("🔄 Step 3: Applying migrations using Drizzle...");
try {
	const { Database } = await import("bun:sqlite");
	const { drizzle } = await import("drizzle-orm/bun-sqlite");
	const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");

	const sqlite = new Database(dbPath);
	const db = drizzle(sqlite);

	const migrationsDir = join(projectRoot, "drizzle");
	await migrate(db, { migrationsFolder: migrationsDir });

	sqlite.close();
	console.log("✅ Migrations applied\n");
} catch (error) {
	console.error("❌ Migration failed:", error);
	process.exit(1);
}

console.log("✅ Test environment ready!\n");
