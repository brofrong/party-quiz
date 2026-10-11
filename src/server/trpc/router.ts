import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getQuizModule, quizModules } from "@/quizzes/registry.server";
import { hasPlayerName, playerNameSchema } from "@/shared/player-name";
import { QUIZ_FILE_FORMAT, type QuizFile, quizFileSchema } from "@/shared/quiz-file";
import { guestProcedure, hostProcedure, publicProcedure, router, run } from "./init";

const quizIdInput = z.object({ quizId: z.string().min(1) });

export const appRouter = router({
  me: publicProcedure.query(({ ctx }) => ({
    user: ctx.user,
    isHost: Boolean(ctx.user && !ctx.user.isAnonymous),
    hasName: hasPlayerName(ctx.user),
  })),

  profile: router({
    setName: guestProcedure
      .input(z.object({ name: playerNameSchema }))
      .mutation(({ ctx, input }) => {
        ctx.renameUser(ctx.user.id, input.name);
        return { name: input.name };
      }),
  }),

  game: router({
    onState: guestProcedure.subscription(async function* ({ ctx, signal }) {
      const leave = ctx.engine.join(ctx.user.id);
      try {
        // ctx.user is captured when the socket connects, so modules take names from their own state.
        const viewer = { id: ctx.user.id, name: ctx.user.name };
        yield* ctx.engine.watch(() => ctx.engine.playerSnapshot(viewer), signal);
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
    /** A guest's own action (a vote). Names come from the session, never from the client. */
    act: guestProcedure.input(z.object({ action: z.unknown() })).mutation(({ ctx, input }) => {
      const name = hasPlayerName(ctx.user) ? ctx.user.name.trim() : "";
      run(() => ctx.engine.playerDispatch({ id: ctx.user.id, name }, input.action));
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
    export: hostProcedure.input(quizIdInput).query(({ ctx, input }): QuizFile => {
      const rec = ctx.repo.get(input.quizId);
      if (!rec) throw new TRPCError({ code: "NOT_FOUND", message: "Викторина не найдена" });
      return {
        format: QUIZ_FILE_FORMAT,
        id: rec.id,
        type: rec.type,
        title: rec.title,
        exportedAt: new Date().toISOString(),
        content: rec.content,
      };
    }),
    import: hostProcedure
      .input(z.object({ quizId: z.string().min(1), file: z.unknown() }))
      .mutation(({ ctx, input }) =>
        run(() => {
          const rec = ctx.repo.get(input.quizId);
          if (!rec) throw new TRPCError({ code: "NOT_FOUND", message: "Викторина не найдена" });
          const file = quizFileSchema.parse(input.file);
          if (file.type !== rec.type) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Файл от другой викторины (тип «${file.type}»)`,
            });
          }
          const module = getQuizModule(rec.type);
          const content = module.contentSchema.parse(file.content);
          const missing = (module.mediaRefs?.(content) ?? []).filter((m) => !ctx.hasMedia(m));
          if (missing.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `На сервере нет картинок для ${missing.length} шт. — сначала задеплой версию с ними`,
            });
          }
          ctx.repo.updateContent(rec.id, content);
          ctx.engine.contentChanged(rec.id);
          return { items: module.itemCount(content) };
        }),
      ),
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
