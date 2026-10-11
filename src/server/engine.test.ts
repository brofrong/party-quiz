import { beforeEach, describe, expect, test } from "bun:test";
import { ZodError, z } from "zod";
import type { FrameRevealHostView, FrameRevealPublicView } from "@/quizzes/frame-reveal/schema";
import { getQuizModule } from "@/quizzes/registry.server";
import type { AnyQuizModule } from "@/quizzes/types";
import { makeContent } from "@/test/fixtures";
import { openDatabase } from "./db";
import { EngineError, GameEngine } from "./engine";
import { createQuizRepo, createSessionStore, type QuizRepo, type SessionStore } from "./repo";

let repo: QuizRepo;
let store: SessionStore;
let engine: GameEngine;
const make = () => new GameEngine({ repo, store, rng: () => 0, log: () => {} });

beforeEach(() => {
  const { db } = openDatabase(":memory:");
  repo = createQuizRepo(db);
  store = createSessionStore(db);
  repo.insertIfMissing({
    id: "frames",
    type: "frame-reveal",
    title: "Угадай кадр",
    content: makeContent(["a", "b", "c"]),
  });
  engine = make();
});

const playerView = (e: GameEngine) => {
  const s = e.playerSnapshot();
  if (s.status !== "playing") throw new Error("not playing");
  return s.view as FrameRevealPublicView;
};

describe("GameEngine", () => {
  test("starts in the lobby", () => {
    expect(engine.playerSnapshot()).toEqual({ status: "lobby", online: 0 });
  });

  test("start + dispatch drive the quiz; guests do not get the answer until reveal", () => {
    engine.start("frames");
    expect(playerView(engine)).toMatchObject({ index: 0, answer: null });
    engine.dispatch({ type: "next" });
    engine.dispatch({ type: "reveal", animation: "random" });
    expect(playerView(engine)).toMatchObject({
      index: 1,
      answer: "Ответ b",
      animation: "dissolve",
    });
    expect(engine.hostSnapshot()).toMatchObject({ status: "playing", title: "Угадай кадр" });
  });

  test("rejects invalid actions and actions in the lobby", () => {
    expect(() => engine.dispatch({ type: "next" })).toThrow(EngineError);
    engine.start("frames");
    expect(() => engine.dispatch({ type: "explode" })).toThrow(ZodError);
    expect(() => engine.start("missing")).toThrow(EngineError);
  });

  test("reset returns to the first slide; stop returns to the lobby", () => {
    engine.start("frames");
    engine.dispatch({ type: "next" });
    engine.reset();
    expect(playerView(engine).index).toBe(0);
    engine.stop();
    expect(engine.playerSnapshot().status).toBe("lobby");
  });

  test("state survives a restart", () => {
    engine.start("frames");
    engine.dispatch({ type: "goto", index: 2 });
    expect(playerView(make()).index).toBe(2);
  });

  test("contentChanged clamps index and picks up edits", () => {
    engine.start("frames");
    engine.dispatch({ type: "goto", index: 2 });
    repo.updateContent("frames", makeContent(["a", "b", "c"], { c: { enabled: false } }));
    engine.contentChanged("frames");
    const host = engine.hostSnapshot();
    if (host.status !== "playing") throw new Error("not playing");
    const view = host.view as FrameRevealHostView;
    expect(view.total).toBe(2);
    expect(view.index).toBe(1);
  });

  test("disabling every slide keeps the game alive", () => {
    engine.start("frames");
    repo.updateContent("frames", makeContent(["a"], { a: { enabled: false } }));
    engine.contentChanged("frames");
    expect(playerView(engine)).toMatchObject({ total: 0, slide: null });
    engine.dispatch({ type: "next" });
    expect(playerView(engine).total).toBe(0);
  });

  test("falls back to the lobby when the active quiz disappears", () => {
    engine.start("frames");
    const ghost = new GameEngine({ repo: { get: () => undefined }, store, log: () => {} });
    expect(ghost.playerSnapshot().status).toBe("lobby");
  });

  test("presence counts unique users and leave is idempotent", () => {
    const leaveA1 = engine.join("a");
    const leaveA2 = engine.join("a");
    const leaveB = engine.join("b");
    expect(engine.online).toBe(2);
    leaveA1();
    leaveA1();
    expect(engine.online).toBe(2);
    leaveA2();
    leaveB();
    expect(engine.online).toBe(0);
  });

  test("watch yields the current snapshot, then every change, and stops on abort", async () => {
    const ac = new AbortController();
    const seen: string[] = [];
    const done = (async () => {
      for await (const s of engine.watch(() => engine.playerSnapshot(), ac.signal)) {
        seen.push(s.status);
        if (seen.length === 2) ac.abort();
      }
    })();
    await Bun.sleep(5);
    engine.start("frames");
    await done;
    expect(seen).toEqual(["lobby", "playing"]);
  });
});

describe("guest actions and personal views", () => {
  // A tiny voting module: guests add their id to a list; each guest sees whether they voted.
  const voting: AnyQuizModule = {
    type: "voting",
    label: "Голосование",
    contentSchema: z.object({}),
    stateSchema: z.object({ voters: z.array(z.string()) }),
    actionSchema: z.never(),
    initialState: () => ({ voters: [] }),
    reduce: (_c, s) => s,
    publicView: (_c, s, viewer) => ({
      count: s.voters.length,
      mine: s.voters.includes(viewer?.id),
    }),
    hostView: (_c, s) => s,
    itemCount: () => 1,
    playerActionSchema: z.object({ type: z.literal("vote") }),
    reducePlayer: (_c, s, player) => {
      if (player.name === "") throw new Error("Сначала представься");
      return { voters: [...s.voters, player.id] };
    },
  };
  const makeVoting = () => {
    repo.insertIfMissing({ id: "poll", type: "voting", title: "Опрос", content: {} });
    const e = new GameEngine({
      repo,
      store,
      log: () => {},
      getModule: (t) => (t === "voting" ? voting : getQuizModule(t)),
    });
    e.start("poll");
    return e;
  };
  const viewOf = (e: GameEngine, id: string) => {
    const s = e.playerSnapshot({ id, name: id });
    if (s.status !== "playing") throw new Error("not playing");
    return s.view;
  };

  test("a guest action reaches reducePlayer and each guest sees their own view", () => {
    const e = makeVoting();
    e.playerDispatch({ id: "ann", name: "Аня" }, { type: "vote" });
    expect(viewOf(e, "ann")).toEqual({ count: 1, mine: true });
    expect(viewOf(e, "bob")).toEqual({ count: 1, mine: false });
  });

  test("module errors become EngineError; invalid actions are ZodError", () => {
    const e = makeVoting();
    expect(() => e.playerDispatch({ id: "x", name: "" }, { type: "vote" })).toThrow(
      new EngineError("Сначала представься"),
    );
    expect(() => e.playerDispatch({ id: "x", name: "X" }, { type: "boom" })).toThrow(ZodError);
  });

  test("quizzes without guest actions reject them", () => {
    engine.start("frames");
    expect(() => engine.playerDispatch({ id: "g", name: "Гость" }, { type: "next" })).toThrow(
      EngineError,
    );
    expect(() => make().playerDispatch({ id: "g", name: "Гость" }, {})).toThrow(EngineError);
  });
});
