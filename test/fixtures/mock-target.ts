/**
 * Mock Target Worker - Reusable Test Fixture
 *
 * A controllable HTTP endpoint for testing the monitor.
 *
 * Two modes of operation:
 * 1. Configuration mode (POST /configure): Set persistent behavior for subsequent requests
 * 2. Normal mode (GET /): Returns response based on current configuration or query params
 *
 * Configuration via POST /configure:
 * - Body: { status: 200, delay: 0, message: "OK" }
 * - Sets the default behavior for all subsequent requests
 *
 * Query parameter overrides (one-time):
 * - ?status=500 → Returns 500 for this request only
 * - ?delay=2000 → Waits 2 seconds before responding
 * - ?message=Error → Custom response body
 *
 * Configuration takes precedence over defaults but query params override everything.
 */

// In-memory state (works in miniflare local mode)
let currentConfig = {
	status: 200,
	delay: 0,
	message: "OK",
};

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// POST /configure - Set persistent configuration
		if (url.pathname === "/configure" && request.method === "POST") {
			try {
				const config = await request.json();
				if (config.status !== undefined)
					currentConfig.status = parseInt(config.status, 10);
				if (config.delay !== undefined)
					currentConfig.delay = parseInt(config.delay, 10);
				if (config.message !== undefined)
					currentConfig.message = config.message;

				return Response.json({
					success: true,
					config: currentConfig,
				});
			} catch (error: any) {
				return Response.json(
					{ error: "Invalid configuration", message: error.message },
					{ status: 400 }
				);
			}
		}

		// GET /config - Get current configuration
		if (url.pathname === "/config" && request.method === "GET") {
			return Response.json(currentConfig);
		}

		// Normal request - use configuration with query param overrides
		const statusCode = url.searchParams.has("status")
			? parseInt(url.searchParams.get("status")!, 10)
			: currentConfig.status;

		const delay = url.searchParams.has("delay")
			? parseInt(url.searchParams.get("delay")!, 10)
			: currentConfig.delay;

		const message = url.searchParams.get("message") || currentConfig.message;

		// Simulate delay if specified
		if (delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		return new Response(message, { status: statusCode });
	},
};
