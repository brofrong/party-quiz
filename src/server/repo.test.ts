import { beforeEach, describe, expect, test } from "bun:test";
import { makeContent } from "@/test/fixtures";
import { openDatabase } from "./db";
import { createQuizRepo, createSessionStore, type QuizRepo, type SessionStore } from "./repo";

let repo: QuizRepo;
let store: SessionStore;
beforeEach(() => {
  const { db } = openDatabase(":memory:");
  repo = createQuizRepo(db);
  store = createSessionStore(db);
});

const rec = {
  id: "frames",
  type: "frame-reveal",
  title: "Угадай кадр",
  content: makeContent(["a"]),
};

describe("quiz repo", () => {
  test("insertIfMissing never overwrites existing content", () => {
    expect(repo.insertIfMissing(rec)).toBe(true);
    expect(repo.insertIfMissing({ ...rec, title: "Другое" })).toBe(false);
    expect(repo.get("frames")?.title).toBe("Угадай кадр");
  });

  test("updateContent changes content and reports unknown ids", () => {
    repo.insertIfMissing(rec);
    const next = makeContent(["a", "b"]);
    expect(repo.updateContent("frames", next)).toBe(true);
    expect(repo.get("frames")?.content).toEqual(next);
    expect(repo.updateContent("missing", next)).toBe(false);
  });

  test("upsert overwrites and list returns records", () => {
    repo.insertIfMissing(rec);
    repo.upsert({ ...rec, title: "Новое" });
    expect(repo.list().map((r) => r.title)).toEqual(["Новое"]);
  });
});

describe("session store", () => {
  test("round-trips the persisted session", () => {
    expect(store.load()).toBeNull();
    store.save({ status: "playing", quizId: "frames", state: { index: 3 } });
    expect(store.load()).toEqual({ status: "playing", quizId: "frames", state: { index: 3 } });
    store.save({ status: "lobby" });
    expect(store.load()).toEqual({ status: "lobby" });
  });
});
