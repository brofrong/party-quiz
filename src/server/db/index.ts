import { Database } from "bun:sqlite";
import { join } from "node:path";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export type Db = BunSQLiteDatabase<typeof schema>;

// Resolved from the working directory (project root in dev, /app in Docker) so it also works bundled.
const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

export function openDatabase(file: string): { sqlite: Database; db: Db } {
  const sqlite = new Database(file, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { sqlite, db };
}
