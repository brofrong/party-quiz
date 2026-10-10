import { cn } from "@/lib/utils";
import { type MediaRef, mediaSrcSet, mediaUrl } from "@/shared/media";

type Props = { media: MediaRef; sizes?: string; className?: string; alt?: string };

export function MediaPicture({ media, sizes = "100vw", className, alt = "" }: Props) {
  const fallback = media.variants[0] ?? media.width;
  return (
    <picture>
      <source type="image/avif" srcSet={mediaSrcSet(media, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={mediaSrcSet(media, "webp")} sizes={sizes} />
      <img
        src={mediaUrl(media, fallback, "webp")}
        alt={alt}
        width={media.width}
        height={media.height}
        decoding="async"
        draggable={false}
        className={cn("select-none", className)}
      />
    </picture>
  );
}
