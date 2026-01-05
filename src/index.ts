import {
	createDb,
	getRecentMessages,
	insertTestMessage,
} from "./db/queries";

interface Env {
	DB: D1Database;
	TEST_MESSAGE?: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const db = createDb(env.DB);

		// Insert a test message
		if (url.pathname === "/insert") {
			const message = env.TEST_MESSAGE || "Hello from D1!";
			await insertTestMessage(db, message);
			return new Response(`Inserted: ${message}`, { status: 200 });
		}

		// Get recent messages
		if (url.pathname === "/messages") {
			const messages = await getRecentMessages(db, 10);
			return Response.json(messages);
		}

		// Return 404 for unknown routes
		if (url.pathname !== "/") {
			return new Response("Not Found", { status: 404 });
		}

		return new Response("Hello from Trival Monitor! Try /insert or /messages", {
			status: 200,
		});
	},
};
