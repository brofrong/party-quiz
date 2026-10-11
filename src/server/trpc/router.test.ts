import { beforeEach, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { FrameRevealPublicView } from "@/quizzes/frame-reveal/schema";
import type { PlayerSnapshot } from "@/shared/game";
import { makeContent } from "@/test/fixtures";
import { openDatabase } from "../db";
import { GameEngine } from "../engine";
import { createQuizRepo, createSessionStore, type QuizRepo } from "../repo";
import type { Context, CtxUser } from "./context";
import { appRouter } from "./router";

let repo: QuizRepo;
let engine: GameEngine;
const host: CtxUser = { id: "h", name: "Ведущий", isAnonymous: false };
const guest: CtxUser = { id: "g", name: "Anonymous", isAnonymous: true };
let missingMedia = new Set<string>();
const hasMedia = (ref: { hash: string }) => !missingMedia.has(ref.hash);
let renamed: Array<[string, string]> = [];
const renameUser = (id: string, name: string) => {
  renamed.push([id, name]);
};
const caller = (user: CtxUser | null) =>
  appRouter.createCaller({ user, engine, repo, hasMedia, renameUser } satisfies Context);

beforeEach(() => {
  const { db } = openDatabase(":memory:");
  repo = createQuizRepo(db);
  repo.insertIfMissing({
    id: "frames",
    type: "frame-reveal",
    title: "Угадай кадр",
    content: makeContent(["a", "b"]),
  });
  engine = new GameEngine({ repo, store: createSessionStore(db) });
  missingMedia = new Set();
  renamed = [];
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof TRPCError ? e.code : "OTHER";
  }
};

const playerView = () => {
  const snap = engine.playerSnapshot();
  if (snap.status !== "playing") throw new Error("not playing");
  return snap.view as FrameRevealPublicView;
};

describe("access control", () => {
  test("guests and anonymous callers cannot use host procedures", async () => {
    expect(await code(caller(guest).game.start({ quizId: "frames" }))).toBe("FORBIDDEN");
    expect(await code(caller(null).game.start({ quizId: "frames" }))).toBe("UNAUTHORIZED");
    expect(await code(caller(guest).quiz.list())).toBe("FORBIDDEN");
    expect(await code(caller(host).quiz.list())).toBe("OK");
  });

  test("me reports host status", async () => {
    expect(await caller(host).me()).toMatchObject({ isHost: true });
    expect(await caller(guest).me()).toMatchObject({ isHost: false });
    expect(await caller(null).me()).toEqual({ user: null, isHost: false, hasName: false });
  });
});

describe("game", () => {
  test("host drives the game, invalid input is BAD_REQUEST", async () => {
    await caller(host).game.start({ quizId: "frames" });
    await caller(host).game.dispatch({ action: { type: "reveal", animation: "curtain" } });
    expect(playerView().answer).toBe("Ответ a");
    expect(await code(caller(host).game.dispatch({ action: { type: "boom" } }))).toBe(
      "BAD_REQUEST",
    );
    expect(await code(caller(host).game.start({ quizId: "nope" }))).toBe("BAD_REQUEST");
  });

  test("guest subscription yields the lobby and counts presence", async () => {
    const iterable = await caller(guest).game.onState();
    const it = (iterable as AsyncIterable<PlayerSnapshot>)[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.value).toEqual({ status: "lobby", online: 1 });
    await it.return?.(undefined);
    expect(engine.online).toBe(0);
  });
});

describe("quiz", () => {
  test("update validates content and reaches guests immediately", async () => {
    await caller(host).game.start({ quizId: "frames" });
    expect(
      await code(caller(host).quiz.update({ quizId: "frames", content: { slides: "x" } })),
    ).toBe("BAD_REQUEST");
    await caller(host).quiz.update({
      quizId: "frames",
      content: makeContent(["a", "b"], { a: { rects: [{ x: 0, y: 0, w: 1, h: 1 }] } }),
    });
    expect(playerView().slide?.rects).toEqual([{ x: 0, y: 0, w: 1, h: 1 }]);
  });

  test("list and get return metadata and content", async () => {
    expect(await caller(host).quiz.list()).toEqual([
      {
        id: "frames",
        type: "frame-reveal",
        typeLabel: "Угадай кадр",
        title: "Угадай кадр",
        itemCount: 2,
      },
    ]);
    expect((await caller(host).quiz.get({ quizId: "frames" })).content).toEqual(
      makeContent(["a", "b"]),
    );
    expect(await code(caller(host).quiz.get({ quizId: "nope" }))).toBe("NOT_FOUND");
  });
});

describe("quiz export/import (moving edits between servers)", () => {
  const edited = makeContent(["b", "a", "c"], { a: { answer: "Новый ответ", enabled: false } });
  const fileFor = (content: unknown) => ({
    format: "party-quiz/quiz@1",
    id: "frames",
    type: "frame-reveal",
    title: "Угадай кадр",
    exportedAt: "2026-10-11T10:00:00.000Z",
    content,
  });

  test("export produces a file that import accepts on another server", async () => {
    const file = await caller(host).quiz.export({ quizId: "frames" });
    expect(file).toMatchObject({ format: "party-quiz/quiz@1", type: "frame-reveal" });
    expect(file.content).toEqual(makeContent(["a", "b"]));
    expect(await caller(host).quiz.import({ quizId: "frames", file })).toEqual({ items: 2 });
  });

  test("import replaces the content and reaches guests immediately", async () => {
    await caller(host).game.start({ quizId: "frames" });
    expect(await caller(host).quiz.import({ quizId: "frames", file: fileFor(edited) })).toEqual({
      items: 2,
    });
    expect((await caller(host).quiz.get({ quizId: "frames" })).content).toEqual(edited);
    expect(playerView().slide?.id).toBe("b");
  });

  test("rejects foreign files, other quiz types and invalid content", async () => {
    const run = (file: unknown) => code(caller(host).quiz.import({ quizId: "frames", file }));
    expect(await run({ hello: "world" })).toBe("BAD_REQUEST");
    expect(await run({ ...fileFor(edited), type: "other-quiz" })).toBe("BAD_REQUEST");
    expect(await run(fileFor({ slides: "nope" }))).toBe("BAD_REQUEST");
    expect((await caller(host).quiz.get({ quizId: "frames" })).content).toEqual(
      makeContent(["a", "b"]),
    );
  });

  test("rejects a file whose pictures this server does not have", async () => {
    const withNewFrame = makeContent(["a", "b", "z9"]);
    missingMedia.add(withNewFrame.slides[2]?.media.hash ?? "");
    expect(
      await code(caller(host).quiz.import({ quizId: "frames", file: fileFor(withNewFrame) })),
    ).toBe("BAD_REQUEST");
  });

  test("guests cannot export or import", async () => {
    expect(await code(caller(guest).quiz.export({ quizId: "frames" }))).toBe("FORBIDDEN");
    expect(await code(caller(guest).quiz.import({ quizId: "frames", file: fileFor(edited) }))).toBe(
      "FORBIDDEN",
    );
  });
});

describe("guest profile and actions", () => {
  test("a guest without a name has hasName=false until they introduce themselves", async () => {
    expect(await caller(guest).me()).toMatchObject({ hasName: false });
    expect(await caller({ ...guest, name: "Петя" }).me()).toMatchObject({ hasName: true });
  });

  test("setName trims, validates and stores the name for the caller only", async () => {
    expect(await caller(guest).profile.setName({ name: "  Петя " })).toEqual({ name: "Петя" });
    expect(renamed).toEqual([["g", "Петя"]]);
    expect(await code(caller(guest).profile.setName({ name: "   " }))).toBe("BAD_REQUEST");
    expect(await code(caller(guest).profile.setName({ name: "x".repeat(25) }))).toBe("BAD_REQUEST");
    expect(await code(caller(null).profile.setName({ name: "Петя" }))).toBe("UNAUTHORIZED");
  });

  test("act needs a game whose quiz accepts guest actions", async () => {
    const act = () => caller(guest).game.act({ action: { type: "vote", option: 0 } });
    expect(await code(act())).toBe("BAD_REQUEST");
    await caller(host).game.start({ quizId: "frames" });
    expect(await code(act())).toBe("BAD_REQUEST");
  });
});
