import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { PersistedSession } from "@/shared/game";

export const quiz = sqliteTable("quiz", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const gameSession = sqliteTable("game_session", {
  id: integer("id").primaryKey(),
  data: text("data", { mode: "json" }).$type<PersistedSession>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
