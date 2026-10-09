import { connection } from "next/server";
import { requireAuth } from "@/lib/auth";
import { openDb, type DB } from "./open";

const g = globalThis as unknown as { __financeDb?: DB };

/**
 * The single entry point for database access in the app.
 *
 * `await connection()` matters: with Cache Components, a synchronous better-sqlite3 query
 * is treated as a "predictable value" and would be PRERENDERED at build time, freezing
 * stale balances into the page. Calling connection() first defers every read to request time.
 * The connection itself is cached on globalThis so dev hot-reloads don't leak handles.
 *
 * It is also the single door to the data, so it enforces the optional PIN lock (see src/proxy.ts).
 */
export async function getDb(): Promise<DB> {
  await connection();
  await requireAuth();
  return (g.__financeDb ??= openDb());
}
