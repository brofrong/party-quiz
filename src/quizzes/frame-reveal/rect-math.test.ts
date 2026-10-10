import { expect, test } from "bun:test";
import { dragRect, MIN_RECT, rectFromPoints } from "./rect-math";

const r = { x: 0.2, y: 0.2, w: 0.3, h: 0.3 };

test("rectFromPoints normalizes reversed drags and clamps to the frame", () => {
  expect(rectFromPoints({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual({
    x: 0.2,
    y: 0.1,
    w: 0.4,
    h: 0.4,
  });
  expect(rectFromPoints({ x: 0.9, y: 0.9 }, { x: 1.4, y: -0.2 })).toEqual({
    x: 0.9,
    y: 0,
    w: 0.1,
    h: 0.9,
  });
});

test("move keeps size and stays inside", () => {
  expect(dragRect(r, "move", 0.1, 0.1)).toEqual({ x: 0.3, y: 0.3, w: 0.3, h: 0.3 });
  expect(dragRect(r, "move", 0.9, -0.9)).toEqual({ x: 0.7, y: 0, w: 0.3, h: 0.3 });
});

test("edges and corners resize with a minimum size", () => {
  expect(dragRect(r, "e", 0.1, 0)).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 });
  expect(dragRect(r, "w", -0.1, 0)).toEqual({ x: 0.1, y: 0.2, w: 0.4, h: 0.3 });
  expect(dragRect(r, "se", 0.1, 0.2)).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.5 });
  expect(dragRect(r, "w", 0.9, 0).w).toBeCloseTo(MIN_RECT, 6);
  expect(dragRect(r, "n", 0, -0.9).y).toBe(0);
});
