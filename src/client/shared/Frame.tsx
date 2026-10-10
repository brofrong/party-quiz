import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";
import type { MediaRef } from "@/shared/media";
import { MediaPicture } from "./MediaPicture";

type Props = {
  media: MediaRef;
  children?: ReactNode;
  className?: string;
  boxRef?: Ref<HTMLDivElement>;
  boxProps?: HTMLAttributes<HTMLDivElement>;
  sizes?: string;
};

/** Fits the picture into the parent (contain) and gives children a box that matches the image exactly. */
export function Frame({ media, children, className, boxRef, boxProps, sizes }: Props) {
  const ratio = media.width / media.height;
  return (
    <div
      className={cn("relative flex h-full w-full items-center justify-center", className)}
      style={{ containerType: "size" }}
    >
      <div
        {...boxProps}
        ref={boxRef}
        data-testid="frame-box"
        className={cn("relative overflow-hidden rounded-lg shadow-2xl", boxProps?.className)}
        style={{
          aspectRatio: `${media.width} / ${media.height}`,
          width: `min(100cqw, calc(100cqh * ${ratio}))`,
        }}
      >
        <MediaPicture
          media={media}
          sizes={sizes}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {children}
      </div>
    </div>
  );
}
