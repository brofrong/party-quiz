import { z } from "zod";
import type { MediaRef } from "@/shared/media";
import { mediaRefSchema } from "@/shared/media-schema";

export const REVEAL_ANIMATIONS = [
  "dissolve",
  "pixels",
  "curtain",
  "collapse",
  "flyaway",
  "shatter",
] as const;
export const revealAnimationSchema = z.enum(REVEAL_ANIMATIONS);
export type RevealAnimation = z.infer<typeof revealAnimationSchema>;

export const ANIMATION_LABELS: Record<RevealAnimation, string> = {
  dissolve: "Растворение",
  pixels: "Пиксели",
  curtain: "Шторка",
  collapse: "Схлопывание",
  flyaway: "Улёт",
  shatter: "Разбитое стекло",
};

const unit = z.number().min(0).max(1);
const size = z.number().gt(0).max(1);
export const rectSchema = z
  .object({ x: unit, y: unit, w: size, h: size })
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, "Квадрат выходит за пределы кадра");
export type Rect = z.infer<typeof rectSchema>;

export const slideSchema = z.object({
  id: z.string().min(1),
  media: mediaRefSchema,
  answer: z.string().trim().min(1, "Ответ не может быть пустым"),
  hint: z.string(),
  rects: z.array(rectSchema),
  enabled: z.boolean(),
});
export type Slide = z.infer<typeof slideSchema>;

export const frameRevealContentSchema = z
  .object({ slides: z.array(slideSchema) })
  .refine(
    (c) => new Set(c.slides.map((s) => s.id)).size === c.slides.length,
    "id кадров должны быть уникальны",
  );
export type FrameRevealContent = z.infer<typeof frameRevealContentSchema>;

export const frameRevealStateSchema = z.object({
  index: z.number().int().min(0),
  /** Id of the slide the state refers to; lets content edits follow it (null = unknown). */
  slideId: z.string().nullable().default(null),
  phase: z.enum(["hidden", "revealed"]),
  animation: revealAnimationSchema,
});
export type FrameRevealState = z.infer<typeof frameRevealStateSchema>;

export const frameRevealActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("prev") }),
  z.object({ type: z.literal("goto"), index: z.number().int().min(0) }),
  z.object({
    type: z.literal("reveal"),
    animation: z.union([revealAnimationSchema, z.literal("random")]),
  }),
  z.object({ type: z.literal("hide") }),
]);
export type FrameRevealAction = z.infer<typeof frameRevealActionSchema>;

export type PublicSlide = Pick<Slide, "id" | "media" | "rects">;

export type FrameRevealPublicView = {
  index: number;
  total: number;
  slide: PublicSlide | null;
  phase: FrameRevealState["phase"];
  animation: RevealAnimation;
  /** Only set after reveal. */
  answer: string | null;
  /** Media of the next slides, for background preloading. */
  preload: MediaRef[];
};

export type FrameRevealHostView = FrameRevealPublicView & {
  currentAnswer: string | null;
  currentHint: string | null;
  slides: Array<{ id: string; media: MediaRef; answer: string }>;
};
