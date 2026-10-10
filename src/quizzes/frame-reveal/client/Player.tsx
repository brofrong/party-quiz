import { AnimatePresence, motion } from "motion/react";
import { Frame } from "@/client/shared/Frame";
import { Preloader } from "@/client/shared/Preloader";
import type { FrameRevealPublicView } from "../schema";
import { Cover } from "./Cover";

export function FrameRevealPlayer({ view: raw }: { view: unknown }) {
  const view = raw as FrameRevealPublicView;
  if (!view.slide) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-xl">
        В викторине нет кадров
      </div>
    );
  }
  const slide = view.slide;
  return (
    <div className="flex h-full w-full flex-col gap-3 p-3 sm:p-6">
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={slide.id}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.45 }}
          >
            <Frame media={slide.media}>
              {slide.rects.map((r, i) => (
                <Cover
                  key={`${r.x}:${r.y}:${r.w}:${r.h}`}
                  rect={r}
                  phase={view.phase}
                  animation={view.animation}
                  seed={`${slide.id}:${i}`}
                />
              ))}
            </Frame>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex min-h-14 flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <span
          data-testid="slide-counter"
          className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-3 py-1 font-mono text-sm text-white/70 tabular-nums"
        >
          {view.index + 1} / {view.total}
        </span>
        <AnimatePresence mode="wait">
          {view.answer && (
            <motion.div
              key={slide.id}
              data-testid="answer"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.5, type: "spring", bounce: 0.35 }}
              className="rounded-2xl bg-primary px-5 py-2 text-center font-bold text-lg text-primary-foreground shadow-lg sm:text-3xl"
            >
              {view.answer}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Preloader media={view.preload} />
    </div>
  );
}
