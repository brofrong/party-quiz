import { EventEmitter, on } from "node:events";
import { getQuizModule } from "@/quizzes/registry.server";
import type { AnyQuizModule } from "@/quizzes/types";
import type { HostSnapshot, PersistedSession, PlayerSnapshot } from "@/shared/game";
import type { QuizRepo, SessionStore } from "./repo";

export class EngineError extends Error {}

type Active = {
  quizId: string;
  quizType: string;
  title: string;
  module: AnyQuizModule;
  content: unknown;
  state: unknown;
};

export type EngineDeps = {
  repo: Pick<QuizRepo, "get">;
  store: SessionStore;
  getModule?: (type: string) => AnyQuizModule;
  rng?: () => number;
  log?: (msg: string, err?: unknown) => void;
};

/** Single source of truth for the one active game; broadcasts every change. */
export class GameEngine {
  private active: Active | null = null;
  private rev = 0;
  private readonly events = new EventEmitter();
  private readonly presence = new Map<string, number>();

  constructor(private readonly deps: EngineDeps) {
    this.events.setMaxListeners(0);
    const saved = deps.store.load();
    if (saved?.status === "playing") {
      try {
        this.active = this.load(saved.quizId, saved.state);
      } catch (err) {
        this.log("Не удалось восстановить игру, переходим в лобби", err);
      }
    }
  }

  start(quizId: string): void {
    this.active = this.load(quizId);
    this.commit();
  }

  stop(): void {
    this.active = null;
    this.commit();
  }

  reset(): void {
    const a = this.requireActive();
    a.state = a.module.initialState(a.content);
    this.commit();
  }

  dispatch(action: unknown): void {
    const a = this.requireActive();
    const parsed = a.module.actionSchema.parse(action);
    a.state = a.module.reduce(a.content, a.state, parsed, this.deps.rng ?? Math.random);
    this.commit();
  }

  contentChanged(quizId: string): void {
    if (this.active?.quizId !== quizId) return;
    try {
      this.active = this.load(quizId, this.active.state);
    } catch (err) {
      this.log("Викторина после правки не загрузилась, переходим в лобби", err);
      this.active = null;
    }
    this.commit();
  }

  playerSnapshot(): PlayerSnapshot {
    const a = this.active;
    if (!a) return { status: "lobby", online: this.online };
    return {
      status: "playing",
      quizId: a.quizId,
      quizType: a.quizType,
      rev: this.rev,
      online: this.online,
      view: a.module.publicView(a.content, a.state),
    };
  }

  hostSnapshot(): HostSnapshot {
    const a = this.active;
    if (!a) return { status: "lobby", online: this.online };
    return {
      status: "playing",
      quizId: a.quizId,
      quizType: a.quizType,
      title: a.title,
      rev: this.rev,
      online: this.online,
      view: a.module.hostView(a.content, a.state),
    };
  }

  get online(): number {
    return this.presence.size;
  }

  join(userId: string): () => void {
    const n = this.presence.get(userId) ?? 0;
    this.presence.set(userId, n + 1);
    if (n === 0) this.emit();
    let left = false;
    return () => {
      if (left) return;
      left = true;
      const m = (this.presence.get(userId) ?? 1) - 1;
      if (m <= 0) {
        this.presence.delete(userId);
        this.emit();
      } else {
        this.presence.set(userId, m);
      }
    };
  }

  /** Yields `get()` immediately and after every change until `signal` aborts. */
  async *watch<T>(get: () => T, signal?: AbortSignal): AsyncGenerator<T> {
    const changes = on(this.events, "change", { signal });
    yield get();
    try {
      for await (const _ of changes) yield get();
    } catch (err) {
      if (!signal?.aborted) throw err;
    }
  }

  private load(quizId: string, state?: unknown): Active {
    const rec = this.deps.repo.get(quizId);
    if (!rec) throw new EngineError(`Викторина «${quizId}» не найдена`);
    const module = (this.deps.getModule ?? getQuizModule)(rec.type);
    const content = module.contentSchema.parse(rec.content);
    const restored = state === undefined ? undefined : module.stateSchema.safeParse(state);
    return {
      quizId,
      quizType: rec.type,
      title: rec.title,
      module,
      content,
      state: restored?.success ? restored.data : module.initialState(content),
    };
  }

  private requireActive(): Active {
    if (!this.active) throw new EngineError("Сейчас нет активной викторины");
    return this.active;
  }

  private persisted(): PersistedSession {
    return this.active
      ? { status: "playing", quizId: this.active.quizId, state: this.active.state }
      : { status: "lobby" };
  }

  private commit(): void {
    this.rev++;
    try {
      this.deps.store.save(this.persisted());
    } catch (err) {
      this.log("Не удалось сохранить состояние игры", err);
    }
    this.emit();
  }

  private emit(): void {
    this.events.emit("change");
  }

  private log(msg: string, err?: unknown): void {
    (this.deps.log ?? console.error)(msg, err);
  }
}
