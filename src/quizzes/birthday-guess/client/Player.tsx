import { Check, Pencil } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { NamePrompt } from "@/client/shared/NamePrompt";
import { usePlayerName } from "@/client/shared/use-player-name";
import { pluralRu } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { PlayerProps } from "../../client-types";
import type { BirthdayPlayerAction, BirthdayPublicView, OptionView } from "../schema";
import { Leaderboard, Podium } from "./Leaderboard";

const LETTERS = ["A", "B", "C", "D"];
const TILE = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-violet-500"];

export function BirthdayPlayer({ view: raw, act }: PlayerProps) {
  const view = raw as BirthdayPublicView;
  const player = usePlayerName();
  const [prompt, setPrompt] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const vote = (option: number) => act?.({ type: "vote", option } satisfies BirthdayPlayerAction);
  const choose = (option: number) => {
    if (!act) return;
    if (player.hasName) return vote(option);
    setPending(option);
    setPrompt(true);
  };
  const myName = view.me?.name ?? player.name ?? undefined;

  return (
    <div className="party-bg relative flex h-full w-full flex-col overflow-y-auto text-white">
      <header className="flex items-center gap-2 p-3 sm:p-5">
        {view.total > 0 && view.stage !== "final" && (
          <span
            data-testid="bg-counter"
            className="rounded-full bg-black/30 px-3 py-1 font-mono text-sm tabular-nums sm:text-lg"
          >
            Вопрос {view.index + 1} из {view.total}
          </span>
        )}
        {act && (
          <button
            type="button"
            data-testid="bg-me"
            onClick={() => setPrompt(true)}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-sm"
          >
            {player.name ? (
              <>
                Ты: <b>{player.name}</b>
                {view.me && <span className="opacity-70">· {view.me.score}</span>}
                <Pencil className="size-3.5 opacity-70" />
              </>
            ) : (
              "Представиться"
            )}
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-6 sm:px-10">
        <AnimatePresence mode="wait">
          {view.stage === "empty" && (
            <p key="empty" className="text-2xl text-white/80">
              Вопросов пока нет
            </p>
          )}
          {view.stage === "answering" && <Waiting key={`wait:${view.index}`} />}
          {(view.stage === "voting" || view.stage === "revealed") && view.options && (
            <motion.div
              key={`q:${view.index}`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex w-full max-w-6xl flex-col items-center gap-5 sm:gap-8"
            >
              <h2
                data-testid="bg-question"
                className="text-balance text-center font-black text-2xl leading-tight sm:text-5xl"
              >
                {view.question}
              </h2>
              <div className="grid w-full gap-3 sm:grid-cols-2 sm:gap-5">
                {view.options.map((o, i) => (
                  <OptionTile
                    // biome-ignore lint/suspicious/noArrayIndexKey: options are fixed slots
                    key={i}
                    index={i}
                    option={o}
                    selected={view.myVote === i}
                    revealed={view.stage === "revealed"}
                    disabled={!act || view.stage !== "voting"}
                    onClick={() => choose(i)}
                  />
                ))}
              </div>
              {view.stage === "voting" ? (
                <p data-testid="bg-voted" className="text-lg text-white/80 sm:text-2xl">
                  Проголосовали: {view.votedCount}
                </p>
              ) : (
                <Result view={view} />
              )}
            </motion.div>
          )}
          {view.stage === "final" && (
            <motion.div
              key="final"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full flex-col items-center gap-6"
            >
              <h2 className="font-black text-3xl sm:text-6xl">Итоги 🎉</h2>
              <Podium rows={view.leaderboard ?? []} highlight={myName} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {view.showScores && view.stage !== "final" && (
          <motion.div
            key="scores"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center gap-6 overflow-y-auto bg-black/85 p-6 pt-12 backdrop-blur"
          >
            <h2 className="font-black text-3xl sm:text-5xl">Таблица очков</h2>
            <Leaderboard rows={view.leaderboard ?? []} highlight={myName} />
          </motion.div>
        )}
      </AnimatePresence>

      <NamePrompt
        open={prompt}
        onOpenChange={(open) => {
          setPrompt(open);
          if (!open) setPending(null);
        }}
        onSaved={() => {
          if (pending !== null) vote(pending);
          setPending(null);
        }}
      />
    </div>
  );
}

function Waiting() {
  return (
    <motion.div
      data-testid="bg-waiting"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex flex-col items-center gap-4 text-center"
    >
      <span className="text-6xl sm:text-8xl">🤔</span>
      <h2 className="font-black text-3xl sm:text-6xl">Аня отвечает…</h2>
      <p className="text-lg text-white/80 sm:text-2xl">Скоро появятся варианты — угадай её ответ</p>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-3 rounded-full bg-white sm:size-4"
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Number.POSITIVE_INFINITY, duration: 0.9, delay: i * 0.15 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

type TileProps = {
  index: number;
  option: OptionView;
  selected: boolean;
  revealed: boolean;
  disabled: boolean;
  onClick: () => void;
};

function OptionTile({ index, option, selected, revealed, disabled, onClick }: TileProps) {
  const correct = revealed && option.correct;
  return (
    <motion.button
      type="button"
      data-testid={`bg-option-${index}`}
      data-correct={correct ? "true" : undefined}
      disabled={disabled}
      onClick={onClick}
      animate={{ scale: correct ? 1.03 : 1, opacity: revealed && !correct ? 0.45 : 1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        "relative flex min-h-16 flex-col items-start gap-1 rounded-2xl px-4 py-3 text-left shadow-lg transition-colors sm:min-h-28 sm:px-6 sm:py-5",
        correct ? "bg-emerald-500" : TILE[index],
        selected && "ring-4 ring-white",
        !disabled && "cursor-pointer",
      )}
    >
      <span className="flex w-full items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black/25 font-black sm:size-11 sm:text-2xl">
          {correct ? <Check className="size-5 sm:size-7" /> : LETTERS[index]}
        </span>
        <span className="min-w-0 flex-1 font-bold text-lg leading-tight sm:text-3xl">
          {option.text}
        </span>
        {selected && !revealed && <Check className="size-6 shrink-0" />}
        {option.count !== null && (
          <span className="shrink-0 font-black text-xl tabular-nums sm:text-3xl">
            {option.count}
          </span>
        )}
      </span>
      {option.names && option.names.length > 0 && (
        <span className="pl-11 text-sm text-white/85 sm:pl-14 sm:text-lg">
          {option.names.join(", ")}
        </span>
      )}
    </motion.button>
  );
}

function Result({ view }: { view: BirthdayPublicView }) {
  const correctCount = view.options?.find((o) => o.correct)?.count ?? 0;
  const banner =
    view.myResult === "correct"
      ? { text: "Угадал! +1 🎉", cls: "bg-emerald-500" }
      : view.myResult === "wrong"
        ? { text: "Мимо 😅", cls: "bg-rose-500" }
        : view.myResult === "none" && view.me
          ? { text: "Ты не голосовал", cls: "bg-black/40" }
          : null;
  return (
    <div className="flex flex-col items-center gap-3">
      {banner && (
        <motion.div
          data-testid="bg-result"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.5, delay: 0.3 }}
          className={cn("rounded-2xl px-6 py-2 font-black text-2xl shadow-lg", banner.cls)}
        >
          {banner.text}
        </motion.div>
      )}
      <p className="text-lg text-white/80 sm:text-2xl">
        Угадали: {correctCount} {pluralRu(correctCount, ["человек", "человека", "человек"])}
      </p>
    </div>
  );
}
