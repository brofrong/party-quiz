import type { BirthdayContent, Question } from "@/quizzes/birthday-guess/schema";

export const makeQuestion = (id: string, overrides: Partial<Question> = {}): Question => ({
  id,
  text: `Вопрос ${id}`,
  decoys: [`${id}-a`, `${id}-b`, `${id}-c`, `${id}-d`],
  enabled: true,
  ...overrides,
});

export const makeBirthdayContent = (
  ids: string[],
  overrides: Record<string, Partial<Question>> = {},
): BirthdayContent => ({ questions: ids.map((id) => makeQuestion(id, overrides[id])) });
