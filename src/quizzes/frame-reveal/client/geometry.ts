import { seededRandom } from "@/shared/random";

export type Shard = {
  points: [number, number][];
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  rotate: number;
  delay: number;
};

/** Point on the unit-square perimeter, t in [0, 4): top, right, bottom, left. */
function perimeter(t: number): [number, number] {
  const edge = Math.floor(t) % 4;
  const f = t - Math.floor(t);
  if (edge === 0) return [f, 0];
  if (edge === 1) return [1, f];
  if (edge === 2) return [1 - f, 1];
  return [0, 1 - f];
}

/** Triangles fanning out of a random impact point; corners are always breakpoints so they tile the square. */
export function buildShards(seed: string, count = 12): Shard[] {
  const rng = seededRandom(seed);
  const c: [number, number] = [0.35 + rng() * 0.3, 0.35 + rng() * 0.3];
  const ts = [0, 1, 2, 3, ...Array.from({ length: Math.max(0, count - 4) }, () => rng() * 4)].sort(
    (a, b) => a - b,
  );
  return ts.map((t, i) => {
    const next = i + 1 < ts.length ? (ts[i + 1] as number) : 4;
    const a = perimeter(t);
    const b = perimeter(next);
    const cx = (c[0] + a[0] + b[0]) / 3;
    const cy = (c[1] + a[1] + b[1]) / 3;
    return {
      points: [c, a, b],
      cx,
      cy,
      dx: (cx - c[0]) * (1.2 + rng() * 1.6),
      dy: 0.9 + rng() * 0.9,
      rotate: (rng() - 0.5) * 140,
      delay: rng() * 0.12,
    };
  });
}
