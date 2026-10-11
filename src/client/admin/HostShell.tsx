import { LogOut, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/client/shared/auth-client";
import { ConnectionBanner } from "@/client/shared/ConnectionBanner";
import { trpc } from "@/client/shared/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HostSnapshot } from "@/shared/game";
import { ConsoleScreen } from "./ConsoleScreen";
import { EditorScreen } from "./EditorScreen";
import { EndGameButton } from "./EndGameButton";
import { QuizList } from "./QuizList";

type Screen = { kind: "home" } | { kind: "console" } | { kind: "editor"; quizId: string };

export function HostShell({ userName }: { userName: string }) {
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "console" });
  trpc.game.onHostState.useSubscription(undefined, {
    onData: (s) => setSnap(s as HostSnapshot),
    onError: (e) => toast.error(e.message),
  });
  const stop = trpc.game.stop.useMutation({ onError: (e) => toast.error(e.message) });
  const playing = snap?.status === "playing" ? snap : null;
  const view: Screen = screen.kind === "console" && !playing ? { kind: "home" } : screen;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
        <button type="button" className="font-bold" onClick={() => setScreen({ kind: "home" })}>
          🎉 Party Quiz
        </button>
        <Badge variant={playing ? "default" : "secondary"}>
          {playing ? `Идёт: ${playing.title}` : "Лобби"}
        </Badge>
        <span
          className="flex items-center gap-1 text-muted-foreground text-sm"
          title="Подключено гостей"
        >
          <Users className="size-4" /> {snap?.online ?? 0}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {playing && view.kind !== "console" && (
            <Button size="sm" onClick={() => setScreen({ kind: "console" })}>
              Открыть пульт
            </Button>
          )}
          {playing && (
            <EndGameButton
              title={playing.title}
              busy={stop.isPending}
              onConfirm={() =>
                stop.mutate(undefined, { onSuccess: () => toast.success("Игра завершена") })
              }
            />
          )}
          <span className="hidden text-muted-foreground text-sm sm:inline">{userName}</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Выйти"
            onClick={() => authClient.signOut().finally(() => location.reload())}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4">
        {view.kind === "home" && (
          <QuizList
            playingId={playing?.quizId}
            onOpenConsole={() => setScreen({ kind: "console" })}
            onEdit={(quizId) => setScreen({ kind: "editor", quizId })}
          />
        )}
        {view.kind === "console" && playing && <ConsoleScreen snapshot={playing} />}
        {view.kind === "editor" && (
          <EditorScreen quizId={view.quizId} onClose={() => setScreen({ kind: "home" })} />
        )}
      </main>
      <ConnectionBanner />
    </div>
  );
}
