import type { z } from "zod";
import type { MediaRef } from "@/shared/media";

/** Who is looking at / acting in the game (a guest session). */
export type Viewer = { id: string; name: string };

/**
 * Server half of a quiz type. Everything here is pure and serializable:
 * the engine stores `state` as JSON and sends views over the wire.
 */
export interface QuizModule<C, S, A, PV, HV, PA = never> {
  type: string;
  label: string;
  contentSchema: z.ZodType<C>;
  stateSchema: z.ZodType<S>;
  actionSchema: z.ZodType<A>;
  initialState(content: C): S;
  reduce(content: C, state: S, action: A, rng: () => number): S;
  /**
   * What guests see; `viewer` lets a module personalise it (e.g. "your vote").
   * Must never contain secrets (answers, other guests' votes) that are not revealed yet.
   */
  publicView(content: C, state: S, viewer: Viewer | null): PV;
  /** What the host console sees. */
  hostView(content: C, state: S): HV;
  itemCount(content: C): number;
  /** Every picture the content references (checked when a quiz file is imported). */
  mediaRefs?(content: C): MediaRef[];
  /** Actions guests may send (e.g. a vote). Without these, guest actions are rejected. */
  playerActionSchema?: z.ZodType<PA>;
  /** Throws an Error with a user-facing message when the action is not allowed right now. */
  reducePlayer?(content: C, state: S, player: Viewer, action: PA): S;
}

// biome-ignore lint/suspicious/noExplicitAny: the registry erases per-module generics
export type AnyQuizModule = QuizModule<any, any, any, any, any, any>;
