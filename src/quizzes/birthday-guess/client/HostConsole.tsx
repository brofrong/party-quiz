import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Send,
  Trophy,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { isTyping } from "@/client/shared/hotkeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { HostConsoleProps } from "../../client-types";
import { canStartVoting } from "../logic";
import {
  type BirthdayAction,
  type BirthdayHostView,
  OPTION_COUNT,
  type Question,
  type Round,
  type RoundPhase,
} from "../schema";
import { BirthdayPlayer } from "./Player";

const PHASE_LABEL: Record<RoundPhase, string> = {
  answering: "Аня отвечает",
  checking: "Проверка вариантов",
  voting: "Гости голосуют",
  revealed: "Ответ открыт",
};
const PHASE_DOT: Record<RoundPhase, string> = {
  answering: "bg-muted-foreground/40",
  checking: "bg-amber-500",
  voting: "bg-sky-500",
  revealed: "bg-emerald-500",
};

export function BirthdayHostConsole({ view: raw, dispatch, busy, onReset }: HostConsoleProps) {
  const view = raw as BirthdayHostView;
  const send = (a: BirthdayAction) => dispatch(a);
  const current = view.current;
  const phase = current?.round.phase;

  // Space advances the round: checking → voting → reveal → next question.
  const advance = () => {
    if (!current) return;
    if (phase === "checking" && canStartVoting(current.question, current.round)) {
      send({ type: "startVoting" });
    } else if (phase === "voting") send({ type: "reveal" });
    else if (phase === "revealed") send({ type: "next" });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat) return;
      if (e.key === "ArrowRight") send({ type: "next" });
      else if (e.key === "ArrowLeft") send({ type: "prev" });
      else if (e.key === " ") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="py-3">
            <CardTitle className="font-medium text-muted-foreground text-sm">Видят гости</CardTitle>
          </CardHeader>
          <CardContent className="h-[46vh] p-0">
            <BirthdayPlayer view={view} />
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center gap-2 py-3">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              {current ? `Вопрос ${view.index + 1} из ${view.total}` : "Пульт"}
            </CardTitle>
            {phase && (
              <Badge variant="secondary" data-testid="bg-phase">
                {PHASE_LABEL[phase]}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4 pt-0">
            {!current && view.stage === "final" && (
              <p className="text-lg">
                Вопросы закончились — на экранах пьедестал. Можно вернуться стрелкой назад.
              </p>
            )}
            {!current && view.stage === "empty" && (
              <p className="text-lg">Включи хотя бы один вопрос в редакторе.</p>
            )}
            {current && phase === "answering" && (
              <AnswerForm
                key={current.question.id}
                question={current.question}
                initial={current.round.answer ?? ""}
                busy={busy}
                onSubmit={(text) => send({ type: "submitAnswer", text })}
              />
            )}
            {current && phase === "checking" && (
              <Checking question={current.question} round={current.round} busy={busy} send={send} />
            )}
            {current && (phase === "voting" || phase === "revealed") && (
              <Votes view={view} round={current.round} busy={busy} send={send} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <Button
            variant="outline"
            aria-label="Предыдущий вопрос"
            disabled={busy || view.index === 0}
            onClick={() => send({ type: "prev" })}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            aria-label="Следующий вопрос"
            data-testid="bg-next"
            disabled={busy || view.stage === "final" || view.stage === "empty"}
            onClick={() => send({ type: "next" })}
          >
            <ChevronRight />
          </Button>
          <Button
            variant={view.showScores ? "default" : "outline"}
            data-testid="bg-scores"
            disabled={busy}
            onClick={() => send({ type: "toggleScores" })}
          >
            <Trophy /> {view.showScores ? "Скрыть таблицу" : "Показать таблицу"}
          </Button>
          <span className="ml-auto hidden text-muted-foreground text-xs lg:inline">
            ← → вопросы · пробел следующий шаг
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.confirm("Начать заново? Очки и голоса обнулятся.") && onReset()}
          >
            <RotateCcw /> Сначала
          </Button>
        </CardContent>
        <Separator />
        <CardContent className="flex flex-wrap gap-1.5 p-4">
          {view.questions.map((q, i) => (
            <button
              type="button"
              key={q.id}
              title={`${q.text} — ${PHASE_LABEL[q.phase]}`}
              onClick={() => send({ type: "goto", index: i })}
              className={cn(
                "flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md border px-2 text-sm tabular-nums transition",
                i === view.index && view.stage !== "final"
                  ? "border-primary bg-primary/10"
                  : "hover:bg-muted",
              )}
            >
              <span className={cn("size-2 rounded-full", PHASE_DOT[q.phase])} />
              {i + 1}
            </button>
          ))}
        </CardContent>
      </Card>

      {view.fullLeaderboard.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="py-3">
            <CardTitle className="font-medium text-muted-foreground text-sm">Очки</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 p-4 pt-0">
            {view.fullLeaderboard.map((r) => (
              <Badge key={r.name} variant="outline" className="text-sm">
                {r.place}. {r.name} — {r.score}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type AnswerProps = {
  question: Question;
  initial: string;
  busy: boolean;
  onSubmit: (text: string) => void;
};

/** What the birthday person sees: only the question — decoys stay hidden until she answers. */
function AnswerForm({ question, initial, busy, onSubmit }: AnswerProps) {
  const [text, setText] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) onSubmit(text.trim());
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">Аня, ответь честно — гости будут угадывать 🙂</p>
      <h2 data-testid="bg-host-question" className="font-black text-3xl leading-tight">
        {question.text}
      </h2>
      <Input
        autoFocus
        data-testid="bg-answer-input"
        value={text}
        maxLength={200}
        placeholder="Твой ответ"
        className="h-14 text-xl md:text-xl"
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        type="submit"
        size="lg"
        data-testid="bg-answer-submit"
        disabled={busy || !text.trim()}
      >
        <Check /> Готово
      </Button>
    </form>
  );
}

type StepProps = { busy: boolean; send: (a: BirthdayAction) => void };

function Checking({
  question,
  round,
  busy,
  send,
}: StepProps & { question: Question; round: Round }) {
  const usable = question.decoys.flatMap((_, i) => (round.excluded.includes(i) ? [] : [i]));
  const inGame = new Set(usable.slice(0, OPTION_COUNT - 1));
  const ready = canStartVoting(question, round);
  return (
    <div className="flex flex-col gap-4">
      <div className="text-muted-foreground text-sm">{question.text}</div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">Ответ Ани</div>
          <div data-testid="bg-host-answer" className="truncate font-bold text-3xl">
            {round.answer}
          </div>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => send({ type: "editAnswer" })}>
          <Pencil /> Исправить
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-muted-foreground text-sm">
          Ложные варианты — отметь те, что совпадают с ответом:
        </div>
        {question.decoys.map((d, i) => {
          const matched = round.excluded.includes(i);
          return (
            <button
              type="button"
              // biome-ignore lint/suspicious/noArrayIndexKey: decoys are fixed slots
              key={i}
              data-testid={`bg-decoy-${i}`}
              disabled={busy}
              onClick={() => send({ type: "toggleDecoy", index: i })}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition hover:bg-muted",
                matched && "border-destructive/60 bg-destructive/10",
              )}
            >
              <span className={cn("flex-1", matched && "line-through opacity-60")}>{d}</span>
              <span className="text-muted-foreground text-xs">
                {matched ? "совпадает — не покажем" : inGame.has(i) ? "в игре" : "запасной"}
              </span>
            </button>
          );
        })}
      </div>
      {!ready && (
        <p className="text-destructive text-sm">
          Осталось меньше {OPTION_COUNT - 1} вариантов — сними отметку или поправь вопрос в
          редакторе.
        </p>
      )}
      <Button
        size="lg"
        data-testid="bg-start-voting"
        disabled={busy || !ready}
        onClick={() => send({ type: "startVoting" })}
      >
        <Send /> Показать гостям
      </Button>
    </div>
  );
}

function Votes({ view, round, busy, send }: StepProps & { view: BirthdayHostView; round: Round }) {
  const revealed = round.phase === "revealed";
  const total = Object.keys(round.votes).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="font-bold text-xl">{view.current?.question.text}</div>
      <div className="flex flex-col gap-1.5">
        {view.liveVotes?.map((o, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: options are fixed slots
            key={i}
            className={cn(
              "flex flex-col gap-0.5 rounded-lg border px-3 py-2",
              i === round.correct && "border-emerald-500 bg-emerald-500/10",
            )}
          >
            <div className="flex items-center gap-2">
              {i === round.correct && <Check className="size-4 text-emerald-500" />}
              <span className="flex-1 font-medium">{o.text}</span>
              <span className="font-bold tabular-nums">{o.names.length}</span>
            </div>
            {o.names.length > 0 && (
              <div className="text-muted-foreground text-xs">{o.names.join(", ")}</div>
            )}
          </div>
        ))}
      </div>
      <div className="text-muted-foreground text-sm">
        Проголосовали: {total} · на экранах {view.votedCount}
      </div>
      {revealed ? (
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => send({ type: "reopen" })}>
            <EyeOff /> Скрыть ответ
          </Button>
          <Button
            size="lg"
            className="flex-1"
            data-testid="bg-next-question"
            disabled={busy}
            onClick={() => send({ type: "next" })}
          >
            {view.index + 1 < view.total ? "Следующий вопрос" : "К итогам"} <ChevronRight />
          </Button>
        </div>
      ) : (
        <Button
          size="lg"
          data-testid="bg-reveal"
          disabled={busy}
          onClick={() => send({ type: "reveal" })}
        >
          <Eye /> Открыть ответ
        </Button>
      )}
    </div>
  );
}
