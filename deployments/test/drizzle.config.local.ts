import type { Config } from "drizzle-kit";

export default {
	schema: "../../src/db/schema.ts",
	out: "../../drizzle",
	dialect: "sqlite",
	dbCredentials: {
		url: "/home/trival/code/production/monitors/trival-monitor/.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject/452beab6e932a7e11d707eba655f2efe8d2d71d3a2c1f47f165efc5c7eddbd8d.sqlite",
	},
} satisfies Config;
