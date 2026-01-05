import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { testTable } from "./schema";

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema: { testTable } });
}

export async function insertTestMessage(
	db: ReturnType<typeof createDb>,
	message: string
) {
	await db.insert(testTable).values({ message });
}

export async function getRecentMessages(
	db: ReturnType<typeof createDb>,
	limit = 10
) {
	return await db.query.testTable.findMany({
		orderBy: [desc(testTable.createdAt)],
		limit,
	});
}
