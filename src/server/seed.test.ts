import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeContent } from "@/test/fixtures";
import { openDatabase } from "./db";
import { createQuizRepo } from "./repo";
import { loadSeedFiles, seedMissing } from "./seed";

const writeSeed = (dir: string, name: string, body: unknown) =>
  writeFileSync(join(dir, name), JSON.stringify(body));

test("loads valid seeds and inserts only missing quizzes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seed-"));
  writeSeed(dir, "frames.json", {
    id: "frames",
    type: "frame-reveal",
    title: "Угадай кадр",
    content: makeContent(["a"]),
  });
  const seeds = await loadSeedFiles(dir);
  expect(seeds.map((s) => s.id)).toEqual(["frames"]);

  const repo = createQuizRepo(openDatabase(":memory:").db);
  expect(seedMissing(repo, seeds)).toEqual(["frames"]);
  expect(seedMissing(repo, seeds)).toEqual([]);
});

test("rejects seeds with invalid content", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seed-"));
  writeSeed(dir, "bad.json", {
    id: "bad",
    type: "frame-reveal",
    title: "x",
    content: { slides: 5 },
  });
  await expect(loadSeedFiles(dir)).rejects.toThrow("bad.json");
});
