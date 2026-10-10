/**
 * Converts selected frames into compressed media + the frame-reveal seed.
 * Usage: bun scripts/media-import.ts --selection ../викторина --frames ../кадры --items ../fetch.py
 */
import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import sharp, { type Sharp } from "sharp";
import { frameRevealContentSchema, type Slide } from "@/quizzes/frame-reveal/schema";
import { type MediaFormat, mediaFileName } from "@/shared/media";
import { normalizeRects, type PixelRect, parseItems, variantWidths } from "./media-lib";

const { values } = parseArgs({
  options: {
    selection: { type: "string" },
    frames: { type: "string" },
    items: { type: "string" },
    "out-media": { type: "string", default: "public/media" },
    "out-content": { type: "string", default: "content/quizzes/frames.json" },
  },
});
const { selection: selectionDir, frames: framesDir, items: itemsFile } = values;
if (!selectionDir || !framesDir || !itemsFile) {
  console.error("Нужны --selection, --frames и --items");
  process.exit(1);
}
const outMedia = values["out-media"] ?? "public/media";
const outContent = values["out-content"] ?? "content/quizzes/frames.json";
mkdirSync(outMedia, { recursive: true });
mkdirSync(dirname(outContent), { recursive: true });

const items = parseItems(await Bun.file(itemsFile).text());
const originals = new Map(
  [...new Bun.Glob("*/*.jpg").scanSync({ cwd: framesDir })].map((p) => [
    basename(p, ".jpg"),
    join(framesDir, p),
  ]),
);

const ENCODERS: Record<MediaFormat, (s: Sharp) => Sharp> = {
  avif: (s) => s.avif({ quality: 55, effort: 6 }),
  webp: (s) => s.webp({ quality: 75, effort: 5 }),
};

const slides: Slide[] = [];
let bytes = 0;
const selection = [...new Bun.Glob("*.json").scanSync({ cwd: selectionDir })].sort();
for (const file of selection) {
  const stem = basename(file, ".json");
  const idx = Number.parseInt(stem.slice(0, 3), 10);
  const variant = stem.split("_").at(-1);
  const item = items.get(idx);
  const src = originals.get(stem);
  if (!item || !src) throw new Error(`Нет данных для ${stem}`);
  const { rects } = (await Bun.file(join(selectionDir, file)).json()) as { rects: PixelRect[] };

  const input = await Bun.file(src).bytes();
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 16);
  const meta = await sharp(input).metadata();
  const { width, height } = meta;
  if (!width || !height) throw new Error(`Не удалось прочитать размер ${src}`);
  const variants = variantWidths(width);

  for (const w of variants) {
    for (const format of ["avif", "webp"] as const) {
      const out = join(outMedia, mediaFileName(hash, w, format));
      if (!(await Bun.file(out).exists())) {
        await ENCODERS[format](sharp(input).resize({ width: w })).toFile(out);
      }
      bytes += statSync(out).size;
    }
  }

  slides.push({
    id: `f${idx}-${variant}`,
    media: { hash, width, height, variants },
    answer: item.title,
    hint: item.hide,
    rects: normalizeRects(rects, width, height),
    enabled: true,
  });
  console.log(`✓ ${stem}`);
}

const content = frameRevealContentSchema.parse({ slides });
await Bun.write(
  outContent,
  `${JSON.stringify({ id: "frames", type: "frame-reveal", title: "Угадай кадр", content }, null, 2)}\n`,
);
console.log(`Готово, кадров: ${slides.length}, медиа ${(bytes / 1024 / 1024).toFixed(1)} МБ`);
