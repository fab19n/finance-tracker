import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

export type DB = BetterSQLite3Database<typeof schema>;

export function defaultDbPath(): string {
  return process.env.DB_PATH ?? path.join(process.cwd(), "data", "finance.db");
}

/**
 * Open (creating if needed) the SQLite database, apply migrations and seed defaults.
 * Free of Next.js imports so scripts and tests can use it directly.
 */
export function openDb(file: string = defaultDbPath()): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  seedIfEmpty(db);
  return db;
}
