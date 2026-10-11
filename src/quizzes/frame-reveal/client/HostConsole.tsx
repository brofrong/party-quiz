import { ChevronLeft, ChevronRight, EyeOff, RotateCcw, Shuffle, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Frame } from "@/client/shared/Frame";
import { isTyping } from "@/client/shared/hotkeys";
import { MediaPicture } from "@/client/shared/MediaPicture";
import { Preloader } from "@/client/shared/Preloader";
import { useLocalStorage } from "@/client/shared/use-local-storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { HostConsoleProps } from "../../client-types";
import {
  ANIMATION_LABELS,
  type FrameRevealAction,
  type FrameRevealHostView,
  REVEAL_ANIMATIONS,
  type RevealAnimation,
} from "../schema";
import { FrameRevealPlayer } from "./Player";

export function FrameRevealHostConsole({ view: raw, dispatch, busy, onReset }: HostConsoleProps) {
  const view = raw as FrameRevealHostView;
  const send = (a: FrameRevealAction) => dispatch(a);
  const [anim, setAnim] = useLocalStorage<RevealAnimation | "random">("reveal-animation", "random");
  const revealed = view.phase === "revealed";
  const toggle = () => send(revealed ? { type: "hide" } : { type: "reveal", animation: anim });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat) return;
      if (e.key === "ArrowRight") send({ type: "next" });
      else if (e.key === "ArrowLeft") send({ type: "prev" });
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const neighbours = view.slides
    .slice(Math.max(0, view.index - 1), view.index + 3)
    .map((s) => s.media);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="py-3">
            <CardTitle className="font-medium text-muted-foreground text-sm">Видят гости</CardTitle>
          </CardHeader>
          <CardContent className="h-[38vh] p-0">
            <FrameRevealPlayer view={view} />
          </CardContent>
        </Card>
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="py-3">
            <CardTitle className="font-medium text-muted-foreground text-sm">Оригинал</CardTitle>
          </CardHeader>
          <CardContent className="h-[38vh] p-3 sm:p-6">
            {view.slide && <Frame media={view.slide.media} />}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              Откуда · кадр {view.total ? view.index + 1 : 0} из {view.total}
            </div>
            <div data-testid="host-answer" className="truncate font-bold text-3xl">
              {view.currentAnswer ?? "—"}
            </div>
            {view.currentHint && (
              <div className="text-muted-foreground">Скрыто: {view.currentHint}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              aria-label="Предыдущий кадр"
              disabled={busy || view.index === 0}
              onClick={() => send({ type: "prev" })}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="lg"
              data-testid="toggle-reveal"
              className="min-w-40"
              disabled={busy || !view.slide}
              onClick={toggle}
            >
              {revealed ? (
                <>
                  <EyeOff /> Закрыть
                </>
              ) : (
                <>
                  <Sparkles /> Открыть
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              aria-label="Следующий кадр"
              disabled={busy || view.index >= view.total - 1}
              onClick={() => send({ type: "next" })}
            >
              <ChevronRight />
            </Button>
          </div>
        </CardContent>
        <Separator />
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <span className="text-muted-foreground text-sm">Анимация:</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={anim}
            onValueChange={(v) => v && setAnim(v as RevealAnimation | "random")}
            className="flex-wrap"
          >
            <ToggleGroupItem value="random">
              <Shuffle /> Случайная
            </ToggleGroupItem>
            {REVEAL_ANIMATIONS.map((a) => (
              <ToggleGroupItem key={a} value={a}>
                {ANIMATION_LABELS[a]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="ml-auto hidden text-muted-foreground text-xs lg:inline">
            ← → листать · пробел открыть
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.confirm("Начать викторину с первого кадра?") && onReset()}
          >
            <RotateCcw /> Сначала
          </Button>
        </CardContent>
      </Card>

      <ScrollArea className="w-full whitespace-nowrap rounded-xl border">
        <div className="flex gap-2 p-2">
          {view.slides.map((s, i) => (
            <button
              type="button"
              key={s.id}
              title={s.answer}
              onClick={() => send({ type: "goto", index: i })}
              className={cn(
                "relative aspect-video h-20 shrink-0 overflow-hidden rounded-md border-2 transition",
                i === view.index
                  ? "border-primary"
                  : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              <MediaPicture media={s.media} sizes="160px" className="h-full w-full object-cover" />
              <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 text-white text-xs">
                {i + 1}
              </span>
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <Preloader media={neighbours} />
    </div>
  );
}
