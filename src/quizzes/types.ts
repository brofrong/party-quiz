import type { z } from "zod";

/**
 * Server half of a quiz type. Everything here is pure and serializable:
 * the engine stores `state` as JSON and sends views over the wire.
 */
export interface QuizModule<C, S, A, PV, HV> {
  type: string;
  label: string;
  contentSchema: z.ZodType<C>;
  stateSchema: z.ZodType<S>;
  actionSchema: z.ZodType<A>;
  initialState(content: C): S;
  reduce(content: C, state: S, action: A, rng: () => number): S;
  /** What guests see. Must never contain secrets (answers) that are not revealed yet. */
  publicView(content: C, state: S): PV;
  /** What the host console sees. */
  hostView(content: C, state: S): HV;
  itemCount(content: C): number;
}

// biome-ignore lint/suspicious/noExplicitAny: the registry erases per-module generics
export type AnyQuizModule = QuizModule<any, any, any, any, any>;
