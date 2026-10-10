import { join } from "node:path";
import { z } from "zod";
import { getQuizModule } from "@/quizzes/registry.server";
import type { QuizRepo } from "./repo";

const seedFileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  type: z.string(),
  title: z.string().min(1),
  content: z.unknown(),
});
export type SeedFile = z.infer<typeof seedFileSchema>;

export async function loadSeedFiles(dir: string): Promise<SeedFile[]> {
  const files = [...new Bun.Glob("*.json").scanSync({ cwd: dir })].sort();
  const seeds: SeedFile[] = [];
  for (const name of files) {
    try {
      const raw = seedFileSchema.parse(await Bun.file(join(dir, name)).json());
      const content = getQuizModule(raw.type).contentSchema.parse(raw.content);
      seeds.push({ ...raw, content });
    } catch (err) {
      throw new Error(`Invalid seed file ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return seeds;
}

export function seedMissing(repo: QuizRepo, seeds: SeedFile[]): string[] {
  return seeds.filter((s) => repo.insertIfMissing(s)).map((s) => s.id);
}
