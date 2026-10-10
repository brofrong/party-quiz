import { expect, test } from "bun:test";
import { makeContent } from "@/test/fixtures";
import { getQuizModule, quizModules } from "./registry.server";

test("frame-reveal is registered and works through the erased interface", () => {
  const m = getQuizModule("frame-reveal");
  expect(m.label).toBe("Угадай кадр");
  const content = m.contentSchema.parse(makeContent(["a", "b"]));
  const state = m.reduce(content, m.initialState(content), { type: "next" }, Math.random);
  expect(m.publicView(content, state).slide.id).toBe("b");
  expect(m.itemCount(content)).toBe(2);
  expect(quizModules.has("frame-reveal")).toBe(true);
});

test("unknown types throw", () => {
  expect(() => getQuizModule("nope")).toThrow("Unknown quiz type: nope");
});
