import { z } from "zod";

export const mediaRefSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{16}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  variants: z.array(z.number().int().positive()).min(1),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;

export const MEDIA_FORMATS = ["avif", "webp"] as const;
export type MediaFormat = (typeof MEDIA_FORMATS)[number];
export const MEDIA_FILE_RE = /^[a-f0-9]{16}-\d{2,5}\.(avif|webp)$/;

export const mediaFileName = (hash: string, width: number, format: MediaFormat) =>
  `${hash}-${width}.${format}`;
export const mediaUrl = (ref: MediaRef, width: number, format: MediaFormat) =>
  `/media/${mediaFileName(ref.hash, width, format)}`;
export const mediaSrcSet = (ref: MediaRef, format: MediaFormat) =>
  ref.variants.map((w) => `${mediaUrl(ref, w, format)} ${w}w`).join(", ");
