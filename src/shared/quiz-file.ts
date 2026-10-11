import { z } from "zod";

/** File format for moving a quiz between servers (e.g. localhost → prod) via the admin UI. */
export const QUIZ_FILE_FORMAT = "party-quiz/quiz@1";

export const quizFileSchema = z.object({
  format: z.literal(QUIZ_FILE_FORMAT, { error: "Это не файл викторины Party Quiz" }),
  id: z.string(),
  type: z.string(),
  title: z.string(),
  exportedAt: z.string().optional(),
  content: z.unknown(),
});
export type QuizFile = z.infer<typeof quizFileSchema>;
