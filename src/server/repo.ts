import { asc, eq } from "drizzle-orm";
import type { PersistedSession } from "@/shared/game";
import type { Db } from "./db";
import { gameSession, quiz } from "./db/schema";

export type QuizRecord = typeof quiz.$inferSelect;
type NewQuiz = Omit<QuizRecord, "updatedAt">;

export function createQuizRepo(db: Db) {
  return {
    list(): QuizRecord[] {
      return db.select().from(quiz).orderBy(asc(quiz.title)).all();
    },
    get(id: string): QuizRecord | undefined {
      return db.select().from(quiz).where(eq(quiz.id, id)).get();
    },
    updateContent(id: string, content: unknown): boolean {
      const rows = db
        .update(quiz)
        .set({ content, updatedAt: new Date() })
        .where(eq(quiz.id, id))
        .returning({ id: quiz.id })
        .all();
      return rows.length > 0;
    },
    insertIfMissing(rec: NewQuiz): boolean {
      const rows = db
        .insert(quiz)
        .values({ ...rec, updatedAt: new Date() })
        .onConflictDoNothing()
        .returning({ id: quiz.id })
        .all();
      return rows.length > 0;
    },
    upsert(rec: NewQuiz): void {
      const updatedAt = new Date();
      db.insert(quiz)
        .values({ ...rec, updatedAt })
        .onConflictDoUpdate({
          target: quiz.id,
          set: { type: rec.type, title: rec.title, content: rec.content, updatedAt },
        })
        .run();
    },
  };
}
export type QuizRepo = ReturnType<typeof createQuizRepo>;

export function createSessionStore(db: Db) {
  return {
    load(): PersistedSession | null {
      return db.select().from(gameSession).where(eq(gameSession.id, 1)).get()?.data ?? null;
    },
    save(data: PersistedSession): void {
      const updatedAt = new Date();
      db.insert(gameSession)
        .values({ id: 1, data, updatedAt })
        .onConflictDoUpdate({ target: gameSession.id, set: { data, updatedAt } })
        .run();
    },
  };
}
export type SessionStore = ReturnType<typeof createSessionStore>;
