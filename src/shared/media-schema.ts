import { z } from "zod";
import type { MediaRef } from "./media";

// Kept apart from ./media so the guest bundle (which only needs the URL helpers) stays free of zod.
export const mediaRefSchema: z.ZodType<MediaRef> = z.object({
  hash: z.string().regex(/^[a-f0-9]{16}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  variants: z.array(z.number().int().positive()).min(1),
});
