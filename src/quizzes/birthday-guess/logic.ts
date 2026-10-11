import type { Viewer } from "../types";
import {
  type BirthdayAction,
  type BirthdayContent,
  type BirthdayHostView,
  type BirthdayPlayerAction,
  type BirthdayPublicView,
  type BirthdayState,
  type LeaderRow,
  OPTION_COUNT,
  type OptionView,
  type Question,
  type Round,
  type Stage,
} from "./schema";

export const enabledQuestions = (c: BirthdayContent) => c.questions.filter((q) => q.enabled);

/** For spotting a decoy that says the same as the answer: case, ё, spacing and edge punctuation. */
export const normalizeAnswer = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .replace(/\s+/g, " ");

const emptyRound = (): Round => ({
  phase: "answering",
  answer: null,
  excluded: [],
  options: null,
  correct: null,
  votes: {},
});

export const initialState = (content?: BirthdayContent): BirthdayState => ({
  index: 0,
  questionId: content ? (enabledQuestions(content)[0]?.id ?? null) : null,
  showScores: false,
  players: {},
  rounds: {},
});

type Located = { questions: Question[]; index: number; question: Question | undefined };

/**
 * Where the state points after content edits: the current question is followed by id.
 * If it is gone, the question now at that position is shown; index == total is the final screen.
 */
function locate(content: BirthdayContent, state: BirthdayState): Located {
  const questions = enabledQuestions(content);
  const total = questions.length;
  const byId = state.questionId ? questions.findIndex((q) => q.id === state.questionId) : -1;
  let index: number;
  if (byId >= 0) index = byId;
  else if (state.questionId === null && state.index >= total) index = total;
  else index = Math.min(state.index, Math.max(total - 1, 0));
  return { questions, index, question: questions[index] };
}

const roundOf = (state: BirthdayState, q: Question | undefined): Round =>
  (q && state.rounds[q.id]) || emptyRound();

const moveTo = (state: BirthdayState, { questions }: Located, index: number): BirthdayState => ({
  ...state,
  index,
  questionId: questions[index]?.id ?? null,
});

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(rng() * (i + 1)), i);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

const usableDecoys = (q: Question, r: Round) => q.decoys.filter((_, i) => !r.excluded.includes(i));

export const canStartVoting = (q: Question, r: Round) =>
  r.phase === "checking" && usableDecoys(q, r).length >= OPTION_COUNT - 1;

export function reduce(
  content: BirthdayContent,
  state: BirthdayState,
  action: BirthdayAction,
  rng: () => number,
): BirthdayState {
  const loc = locate(content, state);
  const total = loc.questions.length;
  const stay = moveTo(state, loc, loc.index);
  const q = loc.question;
  const round = roundOf(state, q);
  const withRound = (r: Round): BirthdayState =>
    q ? { ...stay, rounds: { ...stay.rounds, [q.id]: r } } : stay;

  switch (action.type) {
    case "next":
      return loc.index < total ? moveTo(state, loc, loc.index + 1) : stay;
    case "prev":
      return loc.index > 0 ? moveTo(state, loc, loc.index - 1) : stay;
    case "goto":
      return total ? moveTo(state, loc, Math.min(action.index, total - 1)) : stay;
    case "toggleScores":
      return { ...stay, showScores: !state.showScores };
    case "submitAnswer": {
      if (!q || (round.phase !== "answering" && round.phase !== "checking")) return stay;
      const answer = action.text.trim();
      const key = normalizeAnswer(answer);
      const excluded = q.decoys.flatMap((d, i) => (normalizeAnswer(d) === key ? [i] : []));
      return withRound({ ...round, phase: "checking", answer, excluded });
    }
    case "toggleDecoy": {
      if (!q || round.phase !== "checking") return stay;
      const excluded = round.excluded.includes(action.index)
        ? round.excluded.filter((i) => i !== action.index)
        : [...round.excluded, action.index].sort();
      return withRound({ ...round, excluded });
    }
    case "editAnswer":
      return q && round.phase === "checking" ? withRound({ ...round, phase: "answering" }) : stay;
    case "startVoting": {
      if (!q || !round.answer || !canStartVoting(q, round)) return stay;
      const decoys = usableDecoys(q, round).slice(0, OPTION_COUNT - 1);
      const options = shuffle([round.answer, ...decoys], rng);
      return withRound({
        ...round,
        phase: "voting",
        options,
        correct: options.indexOf(round.answer),
        votes: {},
      });
    }
    case "reveal":
      return q && round.phase === "voting" ? withRound({ ...round, phase: "revealed" }) : stay;
    case "reopen":
      return q && round.phase === "revealed" ? withRound({ ...round, phase: "voting" }) : stay;
  }
}

export function reducePlayer(
  content: BirthdayContent,
  state: BirthdayState,
  player: Viewer,
  action: BirthdayPlayerAction,
): BirthdayState {
  const loc = locate(content, state);
  const q = loc.question;
  const round = roundOf(state, q);
  if (!q || round.phase === "answering" || round.phase === "checking") {
    throw new Error("Голосование ещё не началось");
  }
  if (round.phase === "revealed") throw new Error("Голосование уже закрыто");
  if (!player.name.trim()) throw new Error("Сначала представься");
  if (action.option >= (round.options?.length ?? 0)) throw new Error("Нет такого варианта");
  return {
    ...state,
    players: { ...state.players, [player.id]: player.name.trim() },
    rounds: {
      ...state.rounds,
      [q.id]: { ...round, votes: { ...round.votes, [player.id]: action.option } },
    },
  };
}

const scoreOf = (state: BirthdayState, userId: string) =>
  Object.values(state.rounds).filter(
    (r) => r.phase === "revealed" && r.correct !== null && r.votes[userId] === r.correct,
  ).length;

/** Everyone who voted at least once, best first; equal scores share a place (1, 1, 3). */
export function leaderboard(state: BirthdayState): LeaderRow[] {
  const rows = Object.entries(state.players)
    .map(([id, name]) => ({ name, score: scoreOf(state, id) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
  return rows.map((r) => ({ ...r, place: rows.findIndex((o) => o.score === r.score) + 1 }));
}

const votersOf = (state: BirthdayState, round: Round, option: number) =>
  Object.entries(round.votes)
    .filter(([, v]) => v === option)
    .map(([id]) => state.players[id] ?? "Гость")
    .sort((a, b) => a.localeCompare(b, "ru"));

function stageOf(loc: Located, round: Round): Stage {
  if (!loc.questions.length) return "empty";
  if (!loc.question) return "final";
  if (round.phase === "voting" || round.phase === "revealed") return round.phase;
  return "answering";
}

export function publicView(
  content: BirthdayContent,
  state: BirthdayState,
  viewer: Viewer | null,
): BirthdayPublicView {
  const loc = locate(content, state);
  const round = roundOf(state, loc.question);
  const stage = stageOf(loc, round);
  const open = stage === "voting" || stage === "revealed";
  const revealed = stage === "revealed";
  const options: OptionView[] | null =
    open && round.options
      ? round.options.map((text, i) => {
          const names = revealed ? votersOf(state, round, i) : null;
          return {
            text,
            count: names ? names.length : null,
            names,
            correct: revealed ? i === round.correct : null,
          };
        })
      : null;
  const myVote = open && viewer ? (round.votes[viewer.id] ?? null) : null;
  const myName = viewer ? state.players[viewer.id] : undefined;
  return {
    index: loc.index,
    total: loc.questions.length,
    stage,
    question: open ? (loc.question?.text ?? null) : null,
    options,
    votedCount: open ? Object.keys(round.votes).length : 0,
    myVote,
    myResult:
      revealed && viewer
        ? myVote === null
          ? "none"
          : myVote === round.correct
            ? "correct"
            : "wrong"
        : null,
    me: viewer && myName ? { name: myName, score: scoreOf(state, viewer.id) } : null,
    showScores: state.showScores,
    leaderboard: state.showScores || stage === "final" ? leaderboard(state) : null,
  };
}

export function hostView(content: BirthdayContent, state: BirthdayState): BirthdayHostView {
  const loc = locate(content, state);
  const round = roundOf(state, loc.question);
  const open = round.phase === "voting" || round.phase === "revealed";
  return {
    ...publicView(content, state, null),
    current: loc.question ? { question: loc.question, round } : null,
    liveVotes:
      open && round.options
        ? round.options.map((text, i) => ({ text, names: votersOf(state, round, i) }))
        : null,
    questions: loc.questions.map((q) => ({
      id: q.id,
      text: q.text,
      phase: roundOf(state, q).phase,
    })),
    fullLeaderboard: leaderboard(state),
  };
}
