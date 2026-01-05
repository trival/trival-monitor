import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const testTable = sqliteTable("test", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	message: text("message").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).default(
		sql`(unixepoch())`
	),
});

export type TestRecord = typeof testTable.$inferSelect;
export type NewTestRecord = typeof testTable.$inferInsert;
