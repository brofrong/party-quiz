import type { Rect } from "./schema";

export type DragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type Point = { x: number; y: number };
export const MIN_RECT = 0.02;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const tidy = (x1: number, y1: number, x2: number, y2: number): Rect => ({
  x: r4(x1),
  y: r4(y1),
  w: r4(x2 - x1),
  h: r4(y2 - y1),
});

export function rectFromPoints(a: Point, b: Point): Rect {
  const x1 = clamp(Math.min(a.x, b.x), 0, 1);
  const x2 = clamp(Math.max(a.x, b.x), 0, 1);
  const y1 = clamp(Math.min(a.y, b.y), 0, 1);
  const y2 = clamp(Math.max(a.y, b.y), 0, 1);
  return tidy(x1, y1, x2, y2);
}

export function dragRect(r0: Rect, mode: DragMode, dx: number, dy: number): Rect {
  if (mode === "move") {
    const x = clamp(r0.x + dx, 0, 1 - r0.w);
    const y = clamp(r0.y + dy, 0, 1 - r0.h);
    return tidy(x, y, x + r0.w, y + r0.h);
  }
  let [x1, y1, x2, y2] = [r0.x, r0.y, r0.x + r0.w, r0.y + r0.h];
  if (mode.includes("w")) x1 = clamp(x1 + dx, 0, x2 - MIN_RECT);
  if (mode.includes("e")) x2 = clamp(x2 + dx, x1 + MIN_RECT, 1);
  if (mode.includes("n")) y1 = clamp(y1 + dy, 0, y2 - MIN_RECT);
  if (mode.includes("s")) y2 = clamp(y2 + dy, y1 + MIN_RECT, 1);
  return tidy(x1, y1, x2, y2);
}
