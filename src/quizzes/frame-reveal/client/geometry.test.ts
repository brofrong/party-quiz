import { expect, test } from "bun:test";
import { buildShards } from "./geometry";

const area = (pts: [number, number][]) =>
  Math.abs(
    pts.reduce((s, [x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length] as [number, number];
      return s + x * ny - nx * y;
    }, 0),
  ) / 2;

test("shards are deterministic and tile the whole cover", () => {
  const a = buildShards("f33-1:0", 12);
  expect(a).toEqual(buildShards("f33-1:0", 12));
  expect(a).toHaveLength(12);
  expect(a.reduce((s, sh) => s + area(sh.points), 0)).toBeCloseTo(1, 6);
  expect(buildShards("other", 12)).not.toEqual(a);
});
