import { z } from "zod";

export const DECOY_COUNT = 4;
/** Options shown to guests: the birthday person's answer + this many decoys. */
export const OPTION_COUNT = 4;

export const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1, "Вопрос не может быть пустым"),
  decoys: z
    .array(z.string().trim().min(1, "Заполни все 4 варианта"))
    .length(DECOY_COUNT, `Нужно ровно ${DECOY_COUNT} варианта`),
  enabled: z.boolean(),
});
export type Question = z.infer<typeof questionSchema>;

export const birthdayContentSchema = z
  .object({ questions: z.array(questionSchema) })
  .refine(
    (c) => new Set(c.questions.map((q) => q.id)).size === c.questions.length,
    "id вопросов должны быть уникальны",
  );
export type BirthdayContent = z.infer<typeof birthdayContentSchema>;

export const ROUND_PHASES = ["answering", "checking", "voting", "revealed"] as const;
export type RoundPhase = (typeof ROUND_PHASES)[number];

export const roundSchema = z.object({
  phase: z.enum(ROUND_PHASES),
  /** The birthday person's answer. */
  answer: z.string().nullable(),
  /** Decoy indexes that match the answer and must not be shown. */
  excluded: z.array(z.number().int().min(0)),
  /** Options in display order, frozen when voting starts. */
  options: z.array(z.string()).nullable(),
  /** Index of the answer in `options`. */
  correct: z.number().int().min(0).nullable(),
  /** userId → option index. */
  votes: z.record(z.string(), z.number().int().min(0)),
});
export type Round = z.infer<typeof roundSchema>;

export const birthdayStateSchema = z.object({
  /** Position among enabled questions; == total means the final screen. */
  index: z.number().int().min(0),
  /** Id of the current question; lets content edits follow it (null = final/empty). */
  questionId: z.string().nullable(),
  showScores: z.boolean(),
  /** userId → display name, recorded when the guest votes. */
  players: z.record(z.string(), z.string()),
  rounds: z.record(z.string(), roundSchema),
});
export type BirthdayState = z.infer<typeof birthdayStateSchema>;

export const birthdayActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("prev") }),
  z.object({ type: z.literal("goto"), index: z.number().int().min(0) }),
  z.object({
    type: z.literal("submitAnswer"),
    text: z.string().trim().min(1, "Ответ не может быть пустым").max(200),
  }),
  z.object({
    type: z.literal("toggleDecoy"),
    index: z
      .number()
      .int()
      .min(0)
      .max(DECOY_COUNT - 1),
  }),
  z.object({ type: z.literal("editAnswer") }),
  z.object({ type: z.literal("startVoting") }),
  z.object({ type: z.literal("reveal") }),
  z.object({ type: z.literal("reopen") }),
  z.object({ type: z.literal("toggleScores") }),
]);
export type BirthdayAction = z.infer<typeof birthdayActionSchema>;

export const birthdayPlayerActionSchema = z.object({
  type: z.literal("vote"),
  option: z
    .number()
    .int()
    .min(0)
    .max(OPTION_COUNT - 1),
});
export type BirthdayPlayerAction = z.infer<typeof birthdayPlayerActionSchema>;

export type Stage = "empty" | "answering" | "voting" | "revealed" | "final";

export type OptionView = {
  text: string;
  /** Votes, names and correctness are only set after reveal. */
  count: number | null;
  names: string[] | null;
  correct: boolean | null;
};

export type LeaderRow = { name: string; score: number; place: number };

export type BirthdayPublicView = {
  index: number;
  total: number;
  stage: Stage;
  /** Only set while voting / after reveal. */
  question: string | null;
  options: OptionView[] | null;
  votedCount: number;
  myVote: number | null;
  myResult: "correct" | "wrong" | "none" | null;
  me: { name: string; score: number } | null;
  showScores: boolean;
  /** Set when the scoreboard is shown or on the final screen. */
  leaderboard: LeaderRow[] | null;
};

export type BirthdayHostView = BirthdayPublicView & {
  current: { question: Question; round: Round } | null;
  /** Who voted for what, live (host only). */
  liveVotes: Array<{ text: string; names: string[] }> | null;
  questions: Array<{ id: string; text: string; phase: RoundPhase }>;
  fullLeaderboard: LeaderRow[];
};
