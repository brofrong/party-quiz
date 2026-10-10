import { describe, expect, test } from "bun:test";
import { hashString, mulberry32, seededRandom, shuffle } from "./random";

describe("random", () => {
  test("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  test("hashString differs for different strings", () => {
    expect(hashString("f1-1:0")).not.toBe(hashString("f1-1:1"));
    expect(hashString("abc")).toBe(hashString("abc"));
  });

  test("seededRandom + shuffle produce the same permutation for the same seed", () => {
    const items = Array.from({ length: 64 }, (_, i) => i);
    const p1 = shuffle(items, seededRandom("slide-7"));
    const p2 = shuffle(items, seededRandom("slide-7"));
    expect(p1).toEqual(p2);
    expect([...p1].sort((x, y) => x - y)).toEqual(items);
    expect(items[0]).toBe(0); // input not mutated
  });
});
