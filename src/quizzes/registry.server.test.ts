import { expect, test } from "bun:test";
import { join } from "node:path";
import { loadSeedFiles } from "@/server/seed";
import { makeBirthdayContent } from "@/test/birthday-fixtures";
import { makeContent } from "@/test/fixtures";
import { getQuizModule, quizModules } from "./registry.server";

test("frame-reveal is registered and works through the erased interface", () => {
  const m = getQuizModule("frame-reveal");
  expect(m.label).toBe("Угадай кадр");
  const content = m.contentSchema.parse(makeContent(["a", "b"]));
  const state = m.reduce(content, m.initialState(content), { type: "next" }, Math.random);
  expect(m.publicView(content, state, null).slide.id).toBe("b");
  expect(m.itemCount(content)).toBe(2);
  expect(quizModules.has("frame-reveal")).toBe(true);
});

test("unknown types throw", () => {
  expect(() => getQuizModule("nope")).toThrow("Unknown quiz type: nope");
});

test("birthday-guess accepts guest votes through the erased interface", () => {
  const m = getQuizModule("birthday-guess");
  const content = m.contentSchema.parse(makeBirthdayContent(["q1"]));
  let s = m.initialState(content);
  for (const a of [{ type: "submitAnswer", text: "Да" }, { type: "startVoting" }]) {
    s = m.reduce(content, s, m.actionSchema.parse(a), () => 0);
  }
  const vote = m.playerActionSchema?.parse({ type: "vote", option: 1 });
  s = m.reducePlayer?.(content, s, { id: "u", name: "Петя" }, vote);
  expect(m.publicView(content, s, { id: "u", name: "Петя" }).myVote).toBe(1);
});

test("seed files are valid", async () => {
  const seeds = await loadSeedFiles(join(import.meta.dir, "../../content/quizzes"));
  expect(seeds.map((s) => s.id).sort()).toEqual(["birthday", "frames"]);
  const birthday = seeds.find((s) => s.id === "birthday");
  expect(getQuizModule("birthday-guess").itemCount(birthday?.content)).toBe(15);
});
