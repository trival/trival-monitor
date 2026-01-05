import { describe, test, expect, beforeAll } from "bun:test";

interface TestMessage {
	id: number;
	message: string;
	createdAt: number | null;
}

describe("Test Deployment", () => {
	let workerUrl: string;

	beforeAll(async () => {
		// Note: The setup.ts script should be run before these tests
		// It handles deployment and migration application

		// Alchemy dev mode uses port 1337 by default
		// Can be overridden with WORKER_URL environment variable
		workerUrl = process.env.WORKER_URL || "http://localhost:1337";

		// Give the deployment a moment to be ready
		await new Promise((resolve) => setTimeout(resolve, 1000));
	});

	test("root endpoint responds with hello message", async () => {
		const response = await fetch(workerUrl);
		expect(response.status).toBe(200);

		const text = await response.text();
		expect(text).toContain("Hello from Trival Monitor");
		expect(text).toContain("/insert");
		expect(text).toContain("/messages");
	});

	test("can insert a message to D1", async () => {
		const response = await fetch(`${workerUrl}/insert`);
		expect(response.status).toBe(200);

		const text = await response.text();
		expect(text).toContain("Inserted:");
		expect(text).toContain("Hello from D1!");
	});

	test("can retrieve messages from D1", async () => {
		// First insert a message
		await fetch(`${workerUrl}/insert`);

		// Then retrieve messages
		const response = await fetch(`${workerUrl}/messages`);
		expect(response.status).toBe(200);

		const messages = (await response.json()) as TestMessage[];
		expect(Array.isArray(messages)).toBe(true);
		expect(messages.length).toBeGreaterThan(0);

		// Check message structure
		const message = messages[0];
		expect(message).toHaveProperty("id");
		expect(message).toHaveProperty("message");
		expect(message).toHaveProperty("createdAt");
		expect(message.message).toContain("Hello from D1!");
	});

	test("returns 404 for unknown routes", async () => {
		const response = await fetch(`${workerUrl}/unknown`);
		expect(response.status).toBe(404);
	});
});
