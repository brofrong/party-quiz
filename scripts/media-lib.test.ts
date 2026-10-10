import { expect, test } from "bun:test";
import { normalizeRects, parseItems, variantWidths } from "./media-lib";

test("parseItems reads ITEMS tuples by 1-based index", () => {
  const src = `ITEMS = [
 ("1_Русское_кино","Брат","наушники/плеер","Брат кадр"),
 ("6_Мемы","This is fine","собаку","this is fine dog meme"),
]`;
  expect(parseItems(src).get(2)).toEqual({ title: "This is fine", hide: "собаку" });
  expect(parseItems(src).size).toBe(2);
});

test("normalizeRects converts pixels to clamped 4-decimal fractions", () => {
  expect(normalizeRects([{ x: 192, y: 108, w: 960, h: 1000 }], 1920, 1080)).toEqual([
    { x: 0.1, y: 0.1, w: 0.5, h: 0.9 },
  ]);
});

test("variantWidths never upscales and dedupes", () => {
  expect(variantWidths(3000)).toEqual([1280, 1920]);
  expect(variantWidths(1500)).toEqual([1280, 1500]);
  expect(variantWidths(800)).toEqual([800]);
});
