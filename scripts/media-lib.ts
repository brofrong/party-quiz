import type { Rect } from "@/quizzes/frame-reveal/schema";

export type PixelRect = { x: number; y: number; w: number; h: number };

const TUPLE_RE = /^\s*\("([^"]*)","([^"]*)","([^"]*)","([^"]*)"\),?\s*$/gm;

export function parseItems(fetchPy: string): Map<number, { title: string; hide: string }> {
  const items = new Map<number, { title: string; hide: string }>();
  let i = 0;
  for (const m of fetchPy.matchAll(TUPLE_RE)) {
    i++;
    items.set(i, { title: m[2] ?? "", hide: m[3] ?? "" });
  }
  return items;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function normalizeRects(rects: PixelRect[], width: number, height: number): Rect[] {
  return rects.map((r) => {
    const x = clamp01(r.x / width);
    const y = clamp01(r.y / height);
    return {
      x: round4(x),
      y: round4(y),
      w: round4(Math.min(r.w / width, 1 - x)),
      h: round4(Math.min(r.h / height, 1 - y)),
    };
  });
}

export const VARIANTS = [1280, 1920] as const;

export function variantWidths(width: number): number[] {
  return [...new Set(VARIANTS.map((v) => Math.min(v, width)))].sort((a, b) => a - b);
}
