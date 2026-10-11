import { describe, expect, test } from "bun:test";
import { makeBirthdayContent } from "@/test/birthday-fixtures";
import {
  hostView,
  initialState,
  leaderboard,
  normalizeAnswer,
  publicView,
  reduce,
  reducePlayer,
} from "./logic";
import type { BirthdayAction, BirthdayContent, BirthdayState } from "./schema";

const rng = () => 0; // Fisher–Yates with 0 rotates: [a,b,c,d] → [b,c,d,a]
const content = makeBirthdayContent(["q1", "q2", "q3"], { q2: { enabled: false } });
const ann = { id: "ann", name: "Аня" };
const bob = { id: "bob", name: "Боб" };
const tv = { id: "tv", name: "" };

const run = (c: BirthdayContent, actions: BirthdayAction[], s = initialState(c)) =>
  actions.reduce((st, a) => reduce(c, st, a, rng), s);
const toVoting = (c = content, answer = "Пицца", s?: BirthdayState) =>
  run(c, [{ type: "submitAnswer", text: answer }, { type: "startVoting" }], s);
const roundOf = (s: BirthdayState) => s.rounds[s.questionId ?? ""];

describe("normalizeAnswer", () => {
  test("ignores case, ё, extra spaces and punctuation at the ends", () => {
    expect(normalizeAnswer("  Ёжик   в тумане!! ")).toBe("ежик в тумане");
    expect(normalizeAnswer("«Пицца».")).toBe("пицца");
  });
});

describe("host flow", () => {
  test("starts on the first enabled question waiting for the answer", () => {
    expect(initialState(content)).toMatchObject({ index: 0, questionId: "q1", showScores: false });
    expect(publicView(content, initialState(content), null)).toMatchObject({
      stage: "answering",
      index: 0,
      total: 2,
      question: null,
      options: null,
    });
  });

  test("submitAnswer → checking with matching decoys excluded automatically", () => {
    const c = makeBirthdayContent(["q1"], {
      q1: { decoys: ["Суши", "пицца!", "Борщ", "Плов"] },
    });
    const s = run(c, [{ type: "submitAnswer", text: "  Пицца " }]);
    expect(roundOf(s)).toMatchObject({ phase: "checking", answer: "Пицца", excluded: [1] });
  });

  test("toggleDecoy marks/unmarks, editAnswer goes back keeping the answer", () => {
    let s = run(content, [
      { type: "submitAnswer", text: "Пицца" },
      { type: "toggleDecoy", index: 2 },
    ]);
    expect(roundOf(s)?.excluded).toEqual([2]);
    s = run(content, [{ type: "toggleDecoy", index: 2 }], s);
    expect(roundOf(s)?.excluded).toEqual([]);
    s = run(content, [{ type: "editAnswer" }], s);
    expect(roundOf(s)).toMatchObject({ phase: "answering", answer: "Пицца" });
  });

  test("startVoting uses the spare decoy when one matches and shuffles with rng", () => {
    const s = run(content, [
      { type: "submitAnswer", text: "Пицца" },
      { type: "toggleDecoy", index: 0 },
      { type: "startVoting" },
    ]);
    // pool [Пицца, q1-b, q1-c, q1-d], rotated by rng=0
    expect(roundOf(s)).toMatchObject({
      phase: "voting",
      options: ["q1-b", "q1-c", "q1-d", "Пицца"],
      correct: 3,
    });
  });

  test("startVoting needs 3 usable decoys; repeated startVoting/reveal are no-ops", () => {
    const two = run(content, [
      { type: "submitAnswer", text: "Пицца" },
      { type: "toggleDecoy", index: 0 },
      { type: "toggleDecoy", index: 1 },
    ]);
    expect(run(content, [{ type: "startVoting" }], two)).toEqual(two);

    const voting = toVoting();
    const shuffledOther = reduce(content, voting, { type: "startVoting" }, () => 0.99);
    expect(shuffledOther).toEqual(voting);
    const revealed = run(content, [{ type: "reveal" }], voting);
    expect(run(content, [{ type: "reveal" }], revealed)).toEqual(revealed);
    expect(roundOf(run(content, [{ type: "reopen" }], revealed))?.phase).toBe("voting");
  });

  test("actions that do not fit the phase are no-ops", () => {
    const s = initialState(content);
    for (const a of [
      { type: "toggleDecoy", index: 0 },
      { type: "editAnswer" },
      { type: "startVoting" },
      { type: "reveal" },
      { type: "reopen" },
    ] as BirthdayAction[]) {
      expect(reduce(content, s, a, rng)).toEqual(s);
    }
    const voting = toVoting();
    expect(run(content, [{ type: "submitAnswer", text: "Другое" }], voting)).toEqual(voting);
  });

  test("navigation skips disabled questions, keeps each round and ends on the final screen", () => {
    let s = toVoting();
    s = run(content, [{ type: "next" }], s);
    expect(s).toMatchObject({ index: 1, questionId: "q3" });
    expect(publicView(content, s, null).stage).toBe("answering");
    s = run(content, [{ type: "next" }], s);
    expect(s).toMatchObject({ index: 2, questionId: null });
    expect(publicView(content, s, null).stage).toBe("final");
    expect(run(content, [{ type: "next" }], s)).toEqual(s);
    s = run(content, [{ type: "goto", index: 0 }], s);
    expect(publicView(content, s, null).stage).toBe("voting");
    expect(run(content, [{ type: "prev" }], s)).toEqual(s);
  });

  test("toggleScores shows the leaderboard to everyone", () => {
    const s = run(content, [{ type: "toggleScores" }]);
    expect(publicView(content, s, null)).toMatchObject({ showScores: true, leaderboard: [] });
  });
});

describe("guest votes", () => {
  test("vote, change the vote; the name is recorded", () => {
    let s = toVoting();
    s = reducePlayer(content, s, ann, { type: "vote", option: 0 });
    s = reducePlayer(content, s, ann, { type: "vote", option: 3 });
    expect(roundOf(s)?.votes).toEqual({ ann: 3 });
    expect(s.players).toEqual({ ann: "Аня" });
  });

  test("voting is only possible while voting is open and with a name", () => {
    expect(() =>
      reducePlayer(content, initialState(content), ann, { type: "vote", option: 0 }),
    ).toThrow("Голосование ещё не началось");
    const revealed = run(content, [{ type: "reveal" }], toVoting());
    expect(() => reducePlayer(content, revealed, ann, { type: "vote", option: 0 })).toThrow(
      "Голосование уже закрыто",
    );
    expect(() => reducePlayer(content, toVoting(), tv, { type: "vote", option: 0 })).toThrow(
      "Сначала представься",
    );
  });

  test("scores: one point per revealed round guessed; ties share a place", () => {
    let s = toVoting(); // correct = 3
    s = reducePlayer(content, s, ann, { type: "vote", option: 3 });
    s = reducePlayer(content, s, bob, { type: "vote", option: 1 });
    expect(leaderboard(s).every((r) => r.score === 0)).toBe(true); // not revealed yet
    s = run(content, [{ type: "reveal" }, { type: "next" }], s);
    s = toVoting(content, "Кошка", s);
    s = reducePlayer(content, s, bob, { type: "vote", option: 3 });
    s = run(content, [{ type: "reveal" }], s);
    expect(leaderboard(s)).toEqual([
      { name: "Аня", score: 1, place: 1 },
      { name: "Боб", score: 1, place: 1 },
    ]);
    const c = { id: "cat", name: "Вася" };
    s = run(content, [{ type: "reopen" }], s);
    s = reducePlayer(content, s, c, { type: "vote", option: 0 });
    s = run(content, [{ type: "reveal" }], s);
    expect(leaderboard(s).at(-1)).toEqual({ name: "Вася", score: 0, place: 3 });
  });
});

describe("views", () => {
  test("guests get no secrets before reveal", () => {
    const answering = run(content, [{ type: "submitAnswer", text: "Пицца" }]);
    const v1 = publicView(content, answering, ann);
    expect(JSON.stringify(v1)).not.toContain("Пицца");
    expect(JSON.stringify(v1)).not.toContain("Вопрос q1");
    expect(JSON.stringify(v1)).not.toContain("q1-a");

    let s = toVoting();
    s = reducePlayer(content, s, ann, { type: "vote", option: 2 });
    s = reducePlayer(content, s, bob, { type: "vote", option: 3 });
    const v2 = publicView(content, s, bob);
    expect(v2).toMatchObject({ stage: "voting", question: "Вопрос q1", votedCount: 2, myVote: 3 });
    expect(
      v2.options?.every((o) => o.count === null && o.names === null && o.correct === null),
    ).toBe(true);
    expect(v2.myResult).toBeNull();
  });

  test("after reveal: counts, names, correct option and the guest's result", () => {
    let s = toVoting();
    s = reducePlayer(content, s, ann, { type: "vote", option: 3 });
    s = reducePlayer(content, s, bob, { type: "vote", option: 0 });
    s = run(content, [{ type: "reveal" }], s);
    const v = publicView(content, s, ann);
    expect(v.options?.[3]).toEqual({ text: "Пицца", count: 1, names: ["Аня"], correct: true });
    expect(v.options?.[0]).toEqual({ text: "q1-a", count: 1, names: ["Боб"], correct: false });
    expect(v).toMatchObject({ myResult: "correct", me: { name: "Аня", score: 1 } });
    expect(publicView(content, s, bob).myResult).toBe("wrong");
    expect(publicView(content, s, tv)).toMatchObject({ myResult: "none", me: null });
  });

  test("names come from state, not from the (possibly stale) viewer", () => {
    const s = reducePlayer(content, toVoting(), ann, { type: "vote", option: 0 });
    expect(publicView(content, s, { id: "ann", name: "Anonymous" }).me?.name).toBe("Аня");
  });

  test("host sees the question, decoys, live votes and all questions", () => {
    const s = reducePlayer(content, toVoting(), ann, { type: "vote", option: 1 });
    const h = hostView(content, s);
    expect(h.current?.question.decoys).toHaveLength(4);
    expect(h.current?.round.answer).toBe("Пицца");
    expect(h.liveVotes?.[1]).toEqual({ text: "q1-b", names: ["Аня"] });
    expect(h.questions).toEqual([
      { id: "q1", text: "Вопрос q1", phase: "voting" },
      { id: "q3", text: "Вопрос q3", phase: "answering" },
    ]);
    expect(hostView(content, initialState(content)).current?.round.phase).toBe("answering");
  });
});

describe("content edits during the game", () => {
  test("editing the question text while voting does not change the shown options", () => {
    const s = toVoting();
    const edited = makeBirthdayContent(["q1", "q3"], {
      q1: { text: "Новый текст", decoys: ["x", "y", "z", "w"] },
    });
    const v = publicView(edited, s, null);
    expect(v.question).toBe("Новый текст");
    expect(v.options?.map((o) => o.text)).toEqual(["q1-a", "q1-b", "q1-c", "Пицца"]);
  });

  test("a deleted current question is replaced by the one now in its place", () => {
    const s = run(content, [{ type: "next" }], toVoting()); // on q3
    const edited = makeBirthdayContent(["q1", "q4"]);
    expect(publicView(edited, s, null)).toMatchObject({ index: 1, stage: "answering" });
    expect(reduce(edited, s, { type: "submitAnswer", text: "Да" }, rng)).toMatchObject({
      questionId: "q4",
    });
  });

  test("an empty quiz shows the empty stage and ignores actions", () => {
    const empty: BirthdayContent = { questions: [] };
    const s = initialState(empty);
    expect(publicView(empty, s, null).stage).toBe("empty");
    expect(run(empty, [{ type: "submitAnswer", text: "x" }, { type: "next" }], s)).toEqual(s);
  });
});
