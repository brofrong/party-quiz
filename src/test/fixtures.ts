import type { FrameRevealContent, Slide } from "@/quizzes/frame-reveal/schema";
import type { MediaRef } from "@/shared/media";

export const makeMedia = (n = 0): MediaRef => ({
  hash: n.toString(16).padStart(16, "0"),
  width: 1920,
  height: 1080,
  variants: [1280, 1920],
});

export const makeSlide = (id: string, overrides: Partial<Slide> = {}): Slide => ({
  id,
  media: makeMedia(Number.parseInt(id.replace(/\D/g, "") || "0", 10)),
  answer: `Ответ ${id}`,
  hint: `Подсказка ${id}`,
  rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }],
  enabled: true,
  ...overrides,
});

export const makeContent = (
  ids: string[],
  overrides: Record<string, Partial<Slide>> = {},
): FrameRevealContent => ({ slides: ids.map((id) => makeSlide(id, overrides[id])) });
