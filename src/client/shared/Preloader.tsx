import type { MediaRef } from "@/shared/media";
import { MediaPicture } from "./MediaPicture";

/** Off-screen pictures with the same sources/sizes as the real ones, so the browser caches exactly the right file. */
export function Preloader({ media, sizes }: { media: MediaRef[]; sizes?: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 -left-[9999px] h-px w-px overflow-hidden opacity-0"
    >
      {media.map((m) => (
        <MediaPicture key={m.hash} media={m} sizes={sizes} />
      ))}
    </div>
  );
}
