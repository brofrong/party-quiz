import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ensureGuestSession } from "@/client/shared/auth-client";
import { ConnectionBanner } from "@/client/shared/ConnectionBanner";
import { FullscreenButton } from "@/client/shared/FullscreenButton";
import { Lobby } from "@/client/shared/Lobby";
import { Providers } from "@/client/shared/Providers";
import { ErrorScreen, Splash } from "@/client/shared/Screens";
import { trpc } from "@/client/shared/trpc";
import { useWakeLock } from "@/client/shared/wake-lock";
import { getPlayerModule } from "@/quizzes/registry.player";
import type { PlayerSnapshot } from "@/shared/game";

export function App() {
  const [status, setStatus] = useState<"pending" | "ready" | "error">("pending");
  const start = useCallback(() => {
    setStatus("pending");
    ensureGuestSession().then(
      () => setStatus("ready"),
      () => setStatus("error"),
    );
  }, []);
  useEffect(() => start(), [start]);
  if (status === "error") {
    return <ErrorScreen message="Не получилось подключиться к игре" onRetry={start} />;
  }
  if (status === "pending") return <Splash />;
  return (
    <Providers>
      <PlayerRoot />
    </Providers>
  );
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

function PlayerRoot() {
  const [snap, setSnap] = useState<PlayerSnapshot | null>(null);
  trpc.game.onState.useSubscription(undefined, {
    onData: (s) => setSnap(s as PlayerSnapshot),
  });
  const act = trpc.game.act.useMutation({ onError: (e) => toast.error(e.message) });
  useWakeLock(snap?.status === "playing");
  const Player = snap?.status === "playing" ? getPlayerModule(snap.quizType)?.Player : undefined;
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <AnimatePresence mode="wait">
        {!snap ? (
          <motion.div key="splash" className="h-full" {...fade}>
            <Splash />
          </motion.div>
        ) : snap.status === "lobby" ? (
          <motion.div key="lobby" className="h-full" {...fade}>
            <Lobby online={snap.online} />
          </motion.div>
        ) : (
          <motion.div key={`game:${snap.quizId}`} className="h-full" {...fade}>
            {Player ? (
              <Player view={snap.view} act={(action) => act.mutate({ action })} />
            ) : (
              <ErrorScreen message="Эта викторина не поддерживается — обнови страницу" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <ConnectionBanner />
      <FullscreenButton />
    </main>
  );
}
