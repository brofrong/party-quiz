/** Overwrites quizzes in the database with the seed files. Usage: bun scripts/seed-reset.ts [id ...] */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "@/server/db";
import { loadEnv } from "@/server/env";
import { createQuizRepo } from "@/server/repo";
import { loadSeedFiles } from "@/server/seed";

const env = loadEnv();
const ids = new Set(process.argv.slice(2));
mkdirSync(env.DATA_DIR, { recursive: true });
const repo = createQuizRepo(openDatabase(join(env.DATA_DIR, "app.db")).db);
// Run from the project root (dev) or from dist/ (/app in Docker), where content/ lives.
const seeds = await loadSeedFiles(join(process.cwd(), "content/quizzes"));
for (const s of seeds.filter((s) => ids.size === 0 || ids.has(s.id))) {
  repo.upsert(s);
  console.log(`Перезаписано: ${s.id}`);
}
console.log("Перезапусти сервер, если он запущен.");
