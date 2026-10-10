import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError, z } from "zod";
import { EngineError } from "../engine";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const guestProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Нет сессии" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const hostProcedure = guestProcedure.use(({ ctx, next }) => {
  if (ctx.user.isAnonymous) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Нужен вход через SSO" });
  }
  return next();
});

/** Maps domain errors to client-friendly tRPC errors. */
export function run<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    if (err instanceof ZodError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: z.prettifyError(err), cause: err });
    }
    if (err instanceof EngineError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message, cause: err });
    }
    throw err;
  }
}
