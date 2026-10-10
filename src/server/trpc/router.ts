import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getQuizModule, quizModules } from "@/quizzes/registry.server";
import { guestProcedure, hostProcedure, publicProcedure, router, run } from "./init";

const quizIdInput = z.object({ quizId: z.string().min(1) });

export const appRouter = router({
  me: publicProcedure.query(({ ctx }) => ({
    user: ctx.user,
    isHost: Boolean(ctx.user && !ctx.user.isAnonymous),
  })),

  game: router({
    onState: guestProcedure.subscription(async function* ({ ctx, signal }) {
      const leave = ctx.engine.join(ctx.user.id);
      try {
        yield* ctx.engine.watch(() => ctx.engine.playerSnapshot(), signal);
      } finally {
        leave();
      }
    }),
    onHostState: hostProcedure.subscription(async function* ({ ctx, signal }) {
      yield* ctx.engine.watch(() => ctx.engine.hostSnapshot(), signal);
    }),
    start: hostProcedure.input(quizIdInput).mutation(({ ctx, input }) => {
      run(() => ctx.engine.start(input.quizId));
    }),
    stop: hostProcedure.mutation(({ ctx }) => {
      ctx.engine.stop();
    }),
    reset: hostProcedure.mutation(({ ctx }) => {
      run(() => ctx.engine.reset());
    }),
    dispatch: hostProcedure.input(z.object({ action: z.unknown() })).mutation(({ ctx, input }) => {
      run(() => ctx.engine.dispatch(input.action));
    }),
  }),

  quiz: router({
    list: hostProcedure.query(({ ctx }) =>
      ctx.repo.list().map((r) => {
        const m = quizModules.get(r.type);
        const parsed = m?.contentSchema.safeParse(r.content);
        return {
          id: r.id,
          type: r.type,
          typeLabel: m?.label ?? r.type,
          title: r.title,
          itemCount: m && parsed?.success ? m.itemCount(parsed.data) : 0,
        };
      }),
    ),
    get: hostProcedure.input(quizIdInput).query(({ ctx, input }) => {
      const rec = ctx.repo.get(input.quizId);
      if (!rec) throw new TRPCError({ code: "NOT_FOUND", message: "Викторина не найдена" });
      return { id: rec.id, type: rec.type, title: rec.title, content: rec.content };
    }),
    update: hostProcedure
      .input(z.object({ quizId: z.string().min(1), content: z.unknown() }))
      .mutation(({ ctx, input }) =>
        run(() => {
          const rec = ctx.repo.get(input.quizId);
          if (!rec) throw new TRPCError({ code: "NOT_FOUND", message: "Викторина не найдена" });
          const content = getQuizModule(rec.type).contentSchema.parse(input.content);
          ctx.repo.updateContent(input.quizId, content);
          ctx.engine.contentChanged(input.quizId);
          return { ok: true as const };
        }),
      ),
  }),
});

export type AppRouter = typeof appRouter;
