/** Overwrites quizzes in the database with the seed files. Usage: bun scripts/seed-reset.ts [id ...] */
import { join } from "node:path";
import { openDatabase } from "@/server/db";
import { loadEnv } from "@/server/env";
import { createQuizRepo } from "@/server/repo";
import { loadSeedFiles } from "@/server/seed";

const env = loadEnv();
const ids = new Set(process.argv.slice(2));
const repo = createQuizRepo(openDatabase(join(env.DATA_DIR, "app.db")).db);
const seeds = await loadSeedFiles(join(import.meta.dir, "../content/quizzes"));
for (const s of seeds.filter((s) => ids.size === 0 || ids.has(s.id))) {
  repo.upsert(s);
  console.log(`Перезаписано: ${s.id}`);
}
console.log("Перезапусти сервер, если он запущен.");
