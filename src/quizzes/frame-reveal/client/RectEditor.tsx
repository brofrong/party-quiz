import { X } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { Frame } from "@/client/shared/Frame";
import { cn } from "@/lib/utils";
import type { MediaRef } from "@/shared/media";
import { type DragMode, dragRect, MIN_RECT, type Point, rectFromPoints } from "../rect-math";
import type { Rect } from "../schema";

const HANDLES: Array<{ mode: DragMode; className: string }> = [
  { mode: "n", className: "-top-1.5 inset-x-2 h-3 cursor-ns-resize" },
  { mode: "s", className: "-bottom-1.5 inset-x-2 h-3 cursor-ns-resize" },
  { mode: "e", className: "-right-1.5 inset-y-2 w-3 cursor-ew-resize" },
  { mode: "w", className: "-left-1.5 inset-y-2 w-3 cursor-ew-resize" },
  { mode: "nw", className: "-top-1.5 -left-1.5 size-3 cursor-nwse-resize rounded-sm bg-primary" },
  {
    mode: "se",
    className: "-right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm bg-primary",
  },
  { mode: "ne", className: "-top-1.5 -right-1.5 size-3 cursor-nesw-resize rounded-sm bg-primary" },
  {
    mode: "sw",
    className: "-bottom-1.5 -left-1.5 size-3 cursor-nesw-resize rounded-sm bg-primary",
  },
];

type Drag =
  | { kind: "draw"; p0: Point }
  | { kind: "edit"; i: number; mode: DragMode; p0: Point; r0: Rect };
const pct = (n: number) => `${n * 100}%`;

type Props = { media: MediaRef; rects: Rect[]; onChange: (rects: Rect[]) => void };

export function RectEditor({ media, rects, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);

  const toPoint = (e: PointerEvent): Point => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return { x: 0, y: 0 };
    return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height };
  };
  const begin = (e: PointerEvent, d: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    box.current?.setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toPoint(e);
    if (d.kind === "draw") {
      setDraft(rectFromPoints(d.p0, p));
      return;
    }
    onChange(
      rects.map((r, j) => (j === d.i ? dragRect(d.r0, d.mode, p.x - d.p0.x, p.y - d.p0.y) : r)),
    );
  };
  const onPointerUp = () => {
    if (drag.current?.kind === "draw" && draft && draft.w >= MIN_RECT && draft.h >= MIN_RECT) {
      onChange([...rects, draft]);
    }
    drag.current = null;
    setDraft(null);
  };

  return (
    <Frame
      media={media}
      boxRef={box}
      boxProps={{
        className: "touch-none cursor-crosshair",
        onPointerDown: (e) => {
          if (e.button === 0) begin(e, { kind: "draw", p0: toPoint(e) });
        },
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
      }}
    >
      {rects.map((r, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: rects have no identity; index is their identity
          key={i}
          data-testid="edit-rect"
          className="absolute cursor-move bg-black/90 outline-2 outline-primary outline-dashed"
          style={{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }}
          onPointerDown={(e) => begin(e, { kind: "edit", i, mode: "move", p0: toPoint(e), r0: r })}
        >
          {HANDLES.map((h) => (
            <div
              key={h.mode}
              data-handle={h.mode}
              className={cn("absolute z-10", h.className)}
              onPointerDown={(e) =>
                begin(e, { kind: "edit", i, mode: h.mode, p0: toPoint(e), r0: r })
              }
            />
          ))}
          <button
            type="button"
            aria-label="Удалить квадрат"
            className="absolute top-1 right-1 z-20 rounded-full bg-destructive p-0.5 text-white"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange(rects.filter((_, j) => j !== i))}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {draft && (
        <div
          className="absolute bg-black/80 outline-2 outline-primary outline-dashed"
          style={{
            left: pct(draft.x),
            top: pct(draft.y),
            width: pct(draft.w),
            height: pct(draft.h),
          }}
        />
      )}
    </Frame>
  );
}
