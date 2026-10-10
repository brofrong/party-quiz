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
const caller = (user: CtxUser | null) =>
  appRouter.createCaller({ user, engine, repo } satisfies Context);

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
    expect(await caller(null).me()).toEqual({ user: null, isHost: false });
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
