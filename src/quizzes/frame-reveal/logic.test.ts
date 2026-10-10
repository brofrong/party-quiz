import { describe, expect, test } from "bun:test";
import { makeContent } from "@/test/fixtures";
import { hostView, initialState, publicView, reduce } from "./logic";
import { frameRevealContentSchema, REVEAL_ANIMATIONS } from "./schema";

const rng = () => 0.5;
const content = makeContent(["s1", "s2", "s3", "s4"], { s2: { enabled: false } });

describe("reduce", () => {
  test("next/prev move over enabled slides and hide the frame", () => {
    let s = reduce(content, initialState(), { type: "reveal", animation: "pixels" }, rng);
    s = reduce(content, s, { type: "next" }, rng);
    expect(s).toMatchObject({ index: 1, phase: "hidden" });
    expect(publicView(content, s).slide?.id).toBe("s3"); // s2 is disabled
    s = reduce(content, s, { type: "prev" }, rng);
    expect(s.index).toBe(0);
  });

  test("next on the last slide and prev on the first are no-ops", () => {
    const last = { index: 2, phase: "revealed" as const, animation: "dissolve" as const };
    expect(reduce(content, last, { type: "next" }, rng)).toEqual(last);
    const first = { ...last, index: 0 };
    expect(reduce(content, first, { type: "prev" }, rng)).toEqual(first);
  });

  test("goto clamps and hides; goto to the same slide keeps the phase", () => {
    const s = reduce(content, initialState(), { type: "goto", index: 99 }, rng);
    expect(s).toMatchObject({ index: 2, phase: "hidden" });
    const revealed = { index: 1, phase: "revealed" as const, animation: "dissolve" as const };
    expect(reduce(content, revealed, { type: "goto", index: 1 }, rng).phase).toBe("revealed");
  });

  test("reveal with random resolves to a concrete animation", () => {
    const s = reduce(content, initialState(), { type: "reveal", animation: "random" }, () => 0.99);
    expect(REVEAL_ANIMATIONS).toContain(s.animation);
    expect(s.animation).toBe("shatter");
    expect(s.phase).toBe("revealed");
  });

  test("hide closes the frame", () => {
    const s = reduce(
      content,
      { index: 0, phase: "revealed", animation: "curtain" },
      { type: "hide" },
      rng,
    );
    expect(s.phase).toBe("hidden");
  });

  test("an index left out of range by content edits is clamped", () => {
    const s = reduce(
      content,
      { index: 10, phase: "hidden", animation: "dissolve" },
      { type: "hide" },
      rng,
    );
    expect(s.index).toBe(2);
  });
});

describe("publicView", () => {
  test("does not leak the answer before reveal", () => {
    const v = publicView(content, initialState());
    expect(v.answer).toBeNull();
    expect(JSON.stringify(v)).not.toContain("Ответ");
    expect(JSON.stringify(v)).not.toContain("Подсказка");
  });

  test("shows only the current answer after reveal", () => {
    const v = publicView(content, { index: 0, phase: "revealed", animation: "dissolve" });
    expect(v.answer).toBe("Ответ s1");
    expect(JSON.stringify(v)).not.toContain("Ответ s3");
  });

  test("preloads the next two enabled slides", () => {
    const v = publicView(content, initialState());
    expect(v.total).toBe(3);
    expect(v.preload.map((m) => m.hash)).toEqual(
      [content.slides[2], content.slides[3]].map((s) => s?.media.hash ?? ""),
    );
    expect(publicView(content, { ...initialState(), index: 2 }).preload).toEqual([]);
  });

  test("publicView with no enabled slides", () => {
    const empty = makeContent(["a"], { a: { enabled: false } });
    expect(publicView(empty, initialState())).toEqual({
      index: 0,
      total: 0,
      slide: null,
      phase: "hidden",
      animation: "dissolve",
      answer: null,
      preload: [],
    });
  });
});

describe("hostView", () => {
  test("includes the current answer and hint even when hidden", () => {
    const v = hostView(content, initialState());
    expect(v.currentAnswer).toBe("Ответ s1");
    expect(v.currentHint).toBe("Подсказка s1");
    expect(v.answer).toBeNull();
    expect(v.slides.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
  });
});

describe("content schema", () => {
  test("rejects duplicate ids and rects outside the frame", () => {
    expect(frameRevealContentSchema.safeParse(makeContent(["a", "a"])).success).toBe(false);
    const bad = makeContent(["a"], { a: { rects: [{ x: 0.8, y: 0, w: 0.5, h: 0.2 }] } });
    expect(frameRevealContentSchema.safeParse(bad).success).toBe(false);
  });
});
