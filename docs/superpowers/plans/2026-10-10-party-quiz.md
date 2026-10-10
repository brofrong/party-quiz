# Party Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Realtime party quiz web app: host controls a "guess the frame" quiz from `/admin`, guests and the TV watch synchronized screens at `/`, deployed as a Docker image built by GitHub Actions.

**Architecture:** One Bun process (`Bun.serve`) serves two HTML entrypoints (player, admin) bundled by Bun, Better Auth under `/api/auth/*`, tRPC v11 over HTTP + WebSocket (`trpc-bun-adapter`) under `/api/trpc`, and compressed media under `/media/*`. A `GameEngine` holds the single active game in memory, persists it to SQLite and broadcasts snapshots through tRPC subscriptions. Quiz types are pluggable modules (pure server logic + React client components).

**Tech Stack:** Bun 1.4, TypeScript (strict), React 19, Tailwind v4 + shadcn/ui, motion, @dnd-kit, tRPC 11.19 (+ @trpc/react-query, @tanstack/react-query), trpc-bun-adapter 1.3, Better Auth 1.7.7 (anonymous + genericOAuth), SQLite (`bun:sqlite`) + Drizzle 0.45, zod 4, Biome 2.5, sharp (dev script), puppeteer-core (e2e).

**Spec:** `docs/superpowers/specs/2026-10-10-party-quiz-design.md`

## Global Constraints

- Runtime / package manager / test runner: Bun (`bun`, `bun test`). No npm/yarn/pnpm, no Node-only APIs where a Bun API exists.
- Lint/format: Biome; `bun run check` must pass before every commit.
- TypeScript strict; `bun run typecheck` must pass before every commit.
- All user-facing strings are in Russian.
- Guests never receive `answer`/`hint` of a slide before the host reveals it; never receive answers of other slides.
- Rects are stored as fractions `0..1` of image width/height.
- Media files: `/media/<16-hex-hash>-<width>.(avif|webp)`, served with `Cache-Control: public, max-age=31536000, immutable`.
- Server listens on `PORT` (default `3000`); data lives in `DATA_DIR` (default `./data`, `/data` in Docker), SQLite file `app.db`.
- SSO: OIDC issuer `https://sso.brofrong.ru`, provider id `sso`, callback `/api/auth/callback/sso`, scopes `openid profile email`, PKCE. Any SSO user is a host; anonymous users are guests.
- Dev auth bypass (`AUTH_DEV_BYPASS=1`) is ignored when `NODE_ENV=production`.
- Docker image: `ghcr.io/brofrong/party-quiz`, platforms `linux/amd64,linux/arm64`. Repo `github.com/brofrong/party-quiz` (public).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A guest who opens the page *after* the host revealed a frame must see the open frame immediately, without replaying the cover animation (Task 14 e2e step "late guest").
2. Host disables/reorders slides in the editor while the game shows a slide beyond the new count — guests must see a valid (clamped) slide, not a crash (Task 5 test `contentChanged clamps index`).
3. Host disables every slide — guests see "В викторине нет кадров", engine keeps working (Task 2 test `publicView with no enabled slides`, Task 5 test).
4. Covers must line up with the picture on any aspect ratio / screen (portrait phone, 16:9 TV) — e2e checks the cover box lies inside the image box (Task 14).
5. Production bundle must contain Tailwind styles when Bun bundles HTML at startup inside Docker (Task 15 docker smoke step checks the CSS bundle contains a known utility class).

## File Map

```
party-quiz/
  package.json, bun.lock, bunfig.toml, tsconfig.json, biome.json, components.json
  drizzle.config.ts, drizzle/                     # generated SQL migrations
  styles/globals.css                              # Tailwind + shadcn theme
  content/quizzes/frames.json                     # seed content (generated)
  public/media/*                                  # compressed images (generated)
  scripts/media-lib.ts, media-lib.test.ts         # pure helpers for import
  scripts/media-import.ts                         # CLI: originals -> media + seed
  scripts/seed-reset.ts                           # CLI: overwrite a quiz from seed
  e2e/sync.e2e.ts                                 # browser sync test (manual)
  Dockerfile, .dockerignore, docker-compose.yml, .env.example
  .github/workflows/ci.yml
  README.md
  src/
    components/ui/*                               # shadcn (generated, not linted)
    lib/utils.ts                                  # shadcn cn()
    shared/media.ts                               # MediaRef + URL helpers
    shared/game.ts                                # session / snapshot wire types
    shared/random.ts (+ .test.ts)                 # seeded RNG
    quizzes/types.ts                              # QuizModule contract (server)
    quizzes/client-types.ts                       # QuizClientModule contract
    quizzes/registry.server.ts (+ .test.ts)
    quizzes/registry.client.ts
    quizzes/frame-reveal/schema.ts                # zod schemas + types
    quizzes/frame-reveal/logic.ts (+ .test.ts)    # reduce / views
    quizzes/frame-reveal/module.ts                # QuizModule object
    quizzes/frame-reveal/rect-math.ts (+ .test.ts)
    quizzes/frame-reveal/client/{Player,Cover,HostConsole,Editor,RectEditor,index}.tsx
    test/fixtures.ts                              # test helpers
    server/env.ts (+ .test.ts)
    server/db/{schema,index}.ts
    server/repo.ts (+ .test.ts)
    server/seed.ts (+ .test.ts)
    server/engine.ts (+ .test.ts)
    server/auth.ts
    server/trpc/{init,context,router}.ts (+ router.test.ts)
    server/app.ts (+ app.test.ts)                 # createServer(...)
    server/index.ts                               # entry: imports HTML, starts
    client/shared/{trpc,auth-client,Providers,connection,preload,Frame,Lobby,ConnectionBanner,FullscreenButton,wake-lock}.ts(x)
    client/player/{index.html,main.tsx,App.tsx}
    client/admin/{index.html,main.tsx,App.tsx,Login.tsx,HostShell.tsx,QuizList.tsx,EditorScreen.tsx}
```

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `bunfig.toml`, `tsconfig.json`, `biome.json`, `components.json`, `.gitignore`, `bun-env.d.ts`, `styles/globals.css`, `src/lib/utils.ts`, `src/components/ui/*`, `src/shared/random.ts`, `src/shared/random.test.ts`

**Interfaces:**
- Produces: path alias `@/*` → `src/*`; scripts `dev`, `start`, `test`, `check`, `format`, `typecheck`, `db:generate`, `media:import`, `seed:reset`, `e2e`; `mulberry32(seed: number): () => number`, `hashString(s: string): number`, `seededRandom(seed: string): () => number`, `shuffle<T>(items: T[], rng: () => number): T[]`.

- [ ] **Step 1: Copy the Bun shadcn template pieces**

```bash
cd party-quiz
tmp=$(mktemp -d) && (cd "$tmp" && bun init --react=shadcn -y >/dev/null)
cp "$tmp"/{bunfig.toml,components.json,tsconfig.json,bun-env.d.ts,.gitignore} .
mkdir -p styles src/lib src/components/ui
cp "$tmp"/styles/globals.css styles/
cp "$tmp"/src/lib/utils.ts src/lib/
cp "$tmp"/src/components/ui/*.tsx src/components/ui/
printf '\ndata/\n*.db\n*.db-*\n.env\n' >> .gitignore
```

- [ ] **Step 2: Write `package.json` and install dependencies**

```json
{
  "name": "party-quiz",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot src/server/index.ts",
    "start": "NODE_ENV=production bun src/server/index.ts",
    "test": "bun test",
    "check": "biome check .",
    "format": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "media:import": "bun scripts/media-import.ts",
    "seed:reset": "bun scripts/seed-reset.ts",
    "e2e": "bun e2e/sync.e2e.ts"
  }
}
```

```bash
bun add react react-dom @trpc/server@11.19.0 @trpc/client@11.19.0 @trpc/react-query@11.19.0 \
  @tanstack/react-query trpc-bun-adapter@1.3.2 better-auth@1.7.7 drizzle-orm zod motion \
  @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities qrcode sonner lucide-react clsx \
  tailwind-merge class-variance-authority tw-animate-css bun-plugin-tailwind tailwindcss \
  @radix-ui/react-slot @radix-ui/react-label @radix-ui/react-select
bun add -d @biomejs/biome drizzle-kit sharp puppeteer-core typescript @types/bun \
  @types/react @types/react-dom @types/qrcode
bunx --bun shadcn@latest add badge switch separator tooltip toggle-group scroll-area skeleton -y
```

Expected: `src/components/ui/` contains button, card, input, label, select, textarea, badge, switch, separator, tooltip, toggle-group, scroll-area, skeleton.

- [ ] **Step 3: Write `biome.json`**

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": ["**", "!src/components/ui", "!drizzle", "!public", "!content", "!styles"]
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "double" } },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

- [ ] **Step 4: Adjust `tsconfig.json`** — keep the template, set `"include": ["src", "scripts", "e2e", "*.ts", "bun-env.d.ts"]`, keep `"paths": { "@/*": ["./src/*"] }`.

- [ ] **Step 5: Write the failing test `src/shared/random.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { hashString, mulberry32, seededRandom, shuffle } from "./random";

describe("random", () => {
  test("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  test("hashString differs for different strings", () => {
    expect(hashString("f1-1:0")).not.toBe(hashString("f1-1:1"));
    expect(hashString("abc")).toBe(hashString("abc"));
  });

  test("seededRandom + shuffle produce the same permutation for the same seed", () => {
    const items = Array.from({ length: 64 }, (_, i) => i);
    const p1 = shuffle(items, seededRandom("slide-7"));
    const p2 = shuffle(items, seededRandom("slide-7"));
    expect(p1).toEqual(p2);
    expect([...p1].sort((x, y) => x - y)).toEqual(items);
    expect(items[0]).toBe(0); // input not mutated
  });
});
```

- [ ] **Step 6: Run** `bun test src/shared/random.test.ts` — Expected: FAIL, cannot find module `./random`.

- [ ] **Step 7: Implement `src/shared/random.ts`**

```ts
/** Small deterministic PRNG so every screen renders identical "random" animations. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const seededRandom = (seed: string) => mulberry32(hashString(seed));

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
```

- [ ] **Step 8: Verify** `bun test` (PASS), `bun run check` (no errors; run `bun run format` first if only formatting differs), `bun run typecheck` (no errors).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: scaffold bun + react + shadcn + biome project

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Frame-reveal schemas and pure game logic

**Files:**
- Create: `src/shared/media.ts`, `src/quizzes/frame-reveal/schema.ts`, `src/quizzes/frame-reveal/logic.ts`, `src/test/fixtures.ts`
- Test: `src/quizzes/frame-reveal/logic.test.ts`

**Interfaces:**
- Produces (media): `mediaRefSchema`, `type MediaRef = { hash: string; width: number; height: number; variants: number[] }`, `type MediaFormat = "avif" | "webp"`, `MEDIA_FILE_RE`, `mediaFileName(hash, width, format)`, `mediaUrl(ref, width, format)`, `mediaSrcSet(ref, format)`.
- Produces (schema): `REVEAL_ANIMATIONS`, `type RevealAnimation`, `rectSchema`/`Rect`, `slideSchema`/`Slide`, `frameRevealContentSchema`/`FrameRevealContent`, `frameRevealStateSchema`/`FrameRevealState`, `frameRevealActionSchema`/`FrameRevealAction`, `type PublicSlide`, `type FrameRevealPublicView`, `type FrameRevealHostView`.
- Produces (logic): `enabledSlides(c)`, `initialState()`, `pickAnimation(rng)`, `reduce(content, state, action, rng)`, `publicView(content, state)`, `hostView(content, state)`.
- Produces (fixtures): `makeMedia(n?)`, `makeSlide(id, overrides?)`, `makeContent(ids, overrides?)`.

- [ ] **Step 1: Implement `src/shared/media.ts`** (types only, no logic worth a failing test)

```ts
import { z } from "zod";

export const mediaRefSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{16}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  variants: z.array(z.number().int().positive()).min(1),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;

export const MEDIA_FORMATS = ["avif", "webp"] as const;
export type MediaFormat = (typeof MEDIA_FORMATS)[number];
export const MEDIA_FILE_RE = /^[a-f0-9]{16}-\d{2,5}\.(avif|webp)$/;

export const mediaFileName = (hash: string, width: number, format: MediaFormat) =>
  `${hash}-${width}.${format}`;
export const mediaUrl = (ref: MediaRef, width: number, format: MediaFormat) =>
  `/media/${mediaFileName(ref.hash, width, format)}`;
export const mediaSrcSet = (ref: MediaRef, format: MediaFormat) =>
  ref.variants.map((w) => `${mediaUrl(ref, w, format)} ${w}w`).join(", ");
```

- [ ] **Step 2: Implement `src/quizzes/frame-reveal/schema.ts`**

```ts
import { z } from "zod";
import { type MediaRef, mediaRefSchema } from "@/shared/media";

export const REVEAL_ANIMATIONS = [
  "dissolve",
  "pixels",
  "curtain",
  "collapse",
  "flyaway",
  "shatter",
] as const;
export const revealAnimationSchema = z.enum(REVEAL_ANIMATIONS);
export type RevealAnimation = z.infer<typeof revealAnimationSchema>;

export const ANIMATION_LABELS: Record<RevealAnimation, string> = {
  dissolve: "Растворение",
  pixels: "Пиксели",
  curtain: "Шторка",
  collapse: "Схлопывание",
  flyaway: "Улёт",
  shatter: "Разбитое стекло",
};

const unit = z.number().min(0).max(1);
const size = z.number().gt(0).max(1);
export const rectSchema = z
  .object({ x: unit, y: unit, w: size, h: size })
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, "Квадрат выходит за пределы кадра");
export type Rect = z.infer<typeof rectSchema>;

export const slideSchema = z.object({
  id: z.string().min(1),
  media: mediaRefSchema,
  answer: z.string().trim().min(1, "Ответ не может быть пустым"),
  hint: z.string(),
  rects: z.array(rectSchema),
  enabled: z.boolean(),
});
export type Slide = z.infer<typeof slideSchema>;

export const frameRevealContentSchema = z
  .object({ slides: z.array(slideSchema) })
  .refine(
    (c) => new Set(c.slides.map((s) => s.id)).size === c.slides.length,
    "id кадров должны быть уникальны",
  );
export type FrameRevealContent = z.infer<typeof frameRevealContentSchema>;

export const frameRevealStateSchema = z.object({
  index: z.number().int().min(0),
  phase: z.enum(["hidden", "revealed"]),
  animation: revealAnimationSchema,
});
export type FrameRevealState = z.infer<typeof frameRevealStateSchema>;

export const frameRevealActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("prev") }),
  z.object({ type: z.literal("goto"), index: z.number().int().min(0) }),
  z.object({
    type: z.literal("reveal"),
    animation: z.union([revealAnimationSchema, z.literal("random")]),
  }),
  z.object({ type: z.literal("hide") }),
]);
export type FrameRevealAction = z.infer<typeof frameRevealActionSchema>;

export type PublicSlide = Pick<Slide, "id" | "media" | "rects">;

export type FrameRevealPublicView = {
  index: number;
  total: number;
  slide: PublicSlide | null;
  phase: FrameRevealState["phase"];
  animation: RevealAnimation;
  /** Only set after reveal. */
  answer: string | null;
  /** Media of the next slides, for background preloading. */
  preload: MediaRef[];
};

export type FrameRevealHostView = FrameRevealPublicView & {
  currentAnswer: string | null;
  currentHint: string | null;
  slides: Array<{ id: string; media: MediaRef; answer: string }>;
};
```

- [ ] **Step 3: Write fixtures `src/test/fixtures.ts`**

```ts
import type { FrameRevealContent, Slide } from "@/quizzes/frame-reveal/schema";
import type { MediaRef } from "@/shared/media";

export const makeMedia = (n = 0): MediaRef => ({
  hash: n.toString(16).padStart(16, "0"),
  width: 1920,
  height: 1080,
  variants: [1280, 1920],
});

export const makeSlide = (id: string, overrides: Partial<Slide> = {}): Slide => ({
  id,
  media: makeMedia(Number.parseInt(id.replace(/\D/g, "") || "0", 10)),
  answer: `Ответ ${id}`,
  hint: `Подсказка ${id}`,
  rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }],
  enabled: true,
  ...overrides,
});

export const makeContent = (
  ids: string[],
  overrides: Record<string, Partial<Slide>> = {},
): FrameRevealContent => ({ slides: ids.map((id) => makeSlide(id, overrides[id])) });
```

- [ ] **Step 4: Write the failing test `src/quizzes/frame-reveal/logic.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { makeContent } from "@/test/fixtures";
import { hostView, initialState, publicView, reduce } from "./logic";
import { REVEAL_ANIMATIONS, frameRevealContentSchema } from "./schema";

const rng = () => 0.5;
const content = makeContent(["s1", "s2", "s3", "s4"], { s2: { enabled: false } });

describe("reduce", () => {
  test("next/prev move over enabled slides and hide the frame", () => {
    let s = reduce(content, initialState(), { type: "reveal", animation: "pixels" }, rng);
    s = reduce(content, s, { type: "next" }, rng);
    expect(s).toMatchObject({ index: 1, phase: "hidden" });
    expect(publicView(content, s).slide?.id).toBe("s3"); // s2 is disabled
    s = reduce(content, s, { type: "prev" }, rng);
    expect(s.index).toBe(0);
  });

  test("next on the last slide and prev on the first are no-ops", () => {
    const last = { index: 2, phase: "revealed" as const, animation: "dissolve" as const };
    expect(reduce(content, last, { type: "next" }, rng)).toEqual(last);
    const first = { ...last, index: 0 };
    expect(reduce(content, first, { type: "prev" }, rng)).toEqual(first);
  });

  test("goto clamps and hides; goto to the same slide keeps the phase", () => {
    const s = reduce(content, initialState(), { type: "goto", index: 99 }, rng);
    expect(s).toMatchObject({ index: 2, phase: "hidden" });
    const revealed = { index: 1, phase: "revealed" as const, animation: "dissolve" as const };
    expect(reduce(content, revealed, { type: "goto", index: 1 }, rng).phase).toBe("revealed");
  });

  test("reveal with random resolves to a concrete animation", () => {
    const s = reduce(content, initialState(), { type: "reveal", animation: "random" }, () => 0.99);
    expect(REVEAL_ANIMATIONS).toContain(s.animation);
    expect(s.animation).toBe("shatter");
    expect(s.phase).toBe("revealed");
  });

  test("hide closes the frame", () => {
    const s = reduce(content, { index: 0, phase: "revealed", animation: "curtain" }, { type: "hide" }, rng);
    expect(s.phase).toBe("hidden");
  });

  test("an index left out of range by content edits is clamped", () => {
    const s = reduce(content, { index: 10, phase: "hidden", animation: "dissolve" }, { type: "hide" }, rng);
    expect(s.index).toBe(2);
  });
});

describe("publicView", () => {
  test("does not leak the answer before reveal", () => {
    const v = publicView(content, initialState());
    expect(v.answer).toBeNull();
    expect(JSON.stringify(v)).not.toContain("Ответ");
    expect(JSON.stringify(v)).not.toContain("Подсказка");
  });

  test("shows only the current answer after reveal", () => {
    const v = publicView(content, { index: 0, phase: "revealed", animation: "dissolve" });
    expect(v.answer).toBe("Ответ s1");
    expect(JSON.stringify(v)).not.toContain("Ответ s3");
  });

  test("preloads the next two enabled slides", () => {
    const v = publicView(content, initialState());
    expect(v.total).toBe(3);
    expect(v.preload.map((m) => m.hash)).toEqual([
      content.slides[2]?.media.hash,
      content.slides[3]?.media.hash,
    ]);
    expect(publicView(content, { ...initialState(), index: 2 }).preload).toEqual([]);
  });

  test("publicView with no enabled slides", () => {
    const empty = makeContent(["a"], { a: { enabled: false } });
    expect(publicView(empty, initialState())).toEqual({
      index: 0,
      total: 0,
      slide: null,
      phase: "hidden",
      animation: "dissolve",
      answer: null,
      preload: [],
    });
  });
});

describe("hostView", () => {
  test("includes the current answer and hint even when hidden", () => {
    const v = hostView(content, initialState());
    expect(v.currentAnswer).toBe("Ответ s1");
    expect(v.currentHint).toBe("Подсказка s1");
    expect(v.answer).toBeNull();
    expect(v.slides.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
  });
});

describe("content schema", () => {
  test("rejects duplicate ids and rects outside the frame", () => {
    expect(frameRevealContentSchema.safeParse(makeContent(["a", "a"])).success).toBe(false);
    const bad = makeContent(["a"], { a: { rects: [{ x: 0.8, y: 0, w: 0.5, h: 0.2 }] } });
    expect(frameRevealContentSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 5: Run** `bun test src/quizzes/frame-reveal` — Expected: FAIL, cannot find module `./logic`.

- [ ] **Step 6: Implement `src/quizzes/frame-reveal/logic.ts`**

```ts
import {
  type FrameRevealAction,
  type FrameRevealContent,
  type FrameRevealHostView,
  type FrameRevealPublicView,
  type FrameRevealState,
  REVEAL_ANIMATIONS,
  type RevealAnimation,
} from "./schema";

export const enabledSlides = (c: FrameRevealContent) => c.slides.filter((s) => s.enabled);

const clamp = (i: number, total: number) => (total === 0 ? 0 : Math.min(Math.max(i, 0), total - 1));

export const initialState = (): FrameRevealState => ({
  index: 0,
  phase: "hidden",
  animation: "dissolve",
});

export function pickAnimation(rng: () => number): RevealAnimation {
  const i = Math.min(Math.floor(rng() * REVEAL_ANIMATIONS.length), REVEAL_ANIMATIONS.length - 1);
  return REVEAL_ANIMATIONS[i] as RevealAnimation;
}

export function reduce(
  content: FrameRevealContent,
  state: FrameRevealState,
  action: FrameRevealAction,
  rng: () => number,
): FrameRevealState {
  const total = enabledSlides(content).length;
  const index = clamp(state.index, total);
  switch (action.type) {
    case "next":
      return index + 1 < total
        ? { ...state, index: index + 1, phase: "hidden" }
        : { ...state, index };
    case "prev":
      return index > 0 ? { ...state, index: index - 1, phase: "hidden" } : { ...state, index };
    case "goto": {
      const target = clamp(action.index, total);
      return target === index ? { ...state, index } : { ...state, index: target, phase: "hidden" };
    }
    case "reveal":
      return {
        ...state,
        index,
        phase: "revealed",
        animation: action.animation === "random" ? pickAnimation(rng) : action.animation,
      };
    case "hide":
      return { ...state, index, phase: "hidden" };
  }
}

export function publicView(
  content: FrameRevealContent,
  state: FrameRevealState,
): FrameRevealPublicView {
  const slides = enabledSlides(content);
  const total = slides.length;
  const current = slides[clamp(state.index, total)];
  if (!current) {
    return {
      index: 0,
      total: 0,
      slide: null,
      phase: "hidden",
      animation: state.animation,
      answer: null,
      preload: [],
    };
  }
  const index = clamp(state.index, total);
  return {
    index,
    total,
    slide: { id: current.id, media: current.media, rects: current.rects },
    phase: state.phase,
    animation: state.animation,
    answer: state.phase === "revealed" ? current.answer : null,
    preload: slides.slice(index + 1, index + 3).map((s) => s.media),
  };
}

export function hostView(
  content: FrameRevealContent,
  state: FrameRevealState,
): FrameRevealHostView {
  const view = publicView(content, state);
  const slides = enabledSlides(content);
  const current = view.slide ? slides[view.index] : undefined;
  return {
    ...view,
    currentAnswer: current?.answer ?? null,
    currentHint: current?.hint ?? null,
    slides: slides.map((s) => ({ id: s.id, media: s.media, answer: s.answer })),
  };
}
```

- [ ] **Step 7: Run** `bun test src/quizzes/frame-reveal` — Expected: PASS. Then `bun run check && bun run typecheck`.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat(frame-reveal): schemas and pure game logic"` (+ Co-Authored-By trailer).

---

### Task 3: Quiz module contract and server registry

**Files:**
- Create: `src/quizzes/types.ts`, `src/quizzes/frame-reveal/module.ts`, `src/quizzes/registry.server.ts`
- Test: `src/quizzes/registry.server.test.ts`

**Interfaces:**
- Consumes: Task 2 logic and schemas.
- Produces: `interface QuizModule<C, S, A, PV, HV>` (fields `type`, `label`, `contentSchema`, `stateSchema`, `actionSchema`, `initialState(content)`, `reduce(content, state, action, rng)`, `publicView(content, state)`, `hostView(content, state)`, `itemCount(content)`), `type AnyQuizModule`, `frameRevealModule`, `quizModules: ReadonlyMap<string, AnyQuizModule>`, `getQuizModule(type: string): AnyQuizModule` (throws `Error("Unknown quiz type: <type>")`).

- [ ] **Step 1: Write the failing test `src/quizzes/registry.server.test.ts`**

```ts
import { expect, test } from "bun:test";
import { makeContent } from "@/test/fixtures";
import { getQuizModule, quizModules } from "./registry.server";

test("frame-reveal is registered and works through the erased interface", () => {
  const m = getQuizModule("frame-reveal");
  expect(m.label).toBe("Угадай кадр");
  const content = m.contentSchema.parse(makeContent(["a", "b"]));
  const state = m.reduce(content, m.initialState(content), { type: "next" }, Math.random);
  expect(m.publicView(content, state).slide.id).toBe("b");
  expect(m.itemCount(content)).toBe(2);
  expect(quizModules.has("frame-reveal")).toBe(true);
});

test("unknown types throw", () => {
  expect(() => getQuizModule("nope")).toThrow("Unknown quiz type: nope");
});
```

- [ ] **Step 2: Run** `bun test src/quizzes/registry.server.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/quizzes/types.ts`**

```ts
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
```

- [ ] **Step 4: Implement `src/quizzes/frame-reveal/module.ts`**

```ts
import type { QuizModule } from "../types";
import { enabledSlides, hostView, initialState, publicView, reduce } from "./logic";
import {
  type FrameRevealAction,
  type FrameRevealContent,
  type FrameRevealHostView,
  type FrameRevealPublicView,
  type FrameRevealState,
  frameRevealActionSchema,
  frameRevealContentSchema,
  frameRevealStateSchema,
} from "./schema";

export const frameRevealModule: QuizModule<
  FrameRevealContent,
  FrameRevealState,
  FrameRevealAction,
  FrameRevealPublicView,
  FrameRevealHostView
> = {
  type: "frame-reveal",
  label: "Угадай кадр",
  contentSchema: frameRevealContentSchema,
  stateSchema: frameRevealStateSchema,
  actionSchema: frameRevealActionSchema,
  initialState: () => initialState(),
  reduce,
  publicView,
  hostView,
  itemCount: (c) => enabledSlides(c).length,
};
```

- [ ] **Step 5: Implement `src/quizzes/registry.server.ts`**

```ts
import { frameRevealModule } from "./frame-reveal/module";
import type { AnyQuizModule } from "./types";

// Add new quiz types here (and in registry.client.ts).
const modules: AnyQuizModule[] = [frameRevealModule];

export const quizModules: ReadonlyMap<string, AnyQuizModule> = new Map(
  modules.map((m) => [m.type, m]),
);

export function getQuizModule(type: string): AnyQuizModule {
  const m = quizModules.get(type);
  if (!m) throw new Error(`Unknown quiz type: ${type}`);
  return m;
}
```

- [ ] **Step 6: Run** `bun test` — Expected: PASS. `bun run check && bun run typecheck`.

- [ ] **Step 7: Commit** — `feat: quiz module contract and server registry`.

---

### Task 4: SQLite schema, repositories and seeding

**Files:**
- Create: `src/shared/game.ts`, `src/server/db/schema.ts`, `src/server/db/index.ts`, `drizzle.config.ts`, `drizzle/*` (generated), `src/server/repo.ts`, `src/server/seed.ts`
- Test: `src/server/repo.test.ts`, `src/server/seed.test.ts`

**Interfaces:**
- Produces (shared/game): `type PersistedSession = { status: "lobby" } | { status: "playing"; quizId: string; state: unknown }`, `type PlayerSnapshot`, `type HostSnapshot` (see code).
- Produces (db): `openDatabase(file: string): { sqlite: Database; db: Db }` (runs migrations), `type Db`.
- Produces (repo): `createQuizRepo(db)` → `{ list(): QuizRecord[]; get(id): QuizRecord | undefined; updateContent(id, content): boolean; insertIfMissing(rec): boolean; upsert(rec): void }`, `type QuizRecord = { id: string; type: string; title: string; content: unknown; updatedAt: Date }`, `type QuizRepo`; `createSessionStore(db)` → `{ load(): PersistedSession | null; save(s: PersistedSession): void }`, `type SessionStore`.
- Produces (seed): `type SeedFile = { id: string; type: string; title: string; content: unknown }`, `loadSeedFiles(dir: string): Promise<SeedFile[]>` (validates content with the module schema), `seedMissing(repo, seeds): string[]` (ids inserted).

- [ ] **Step 1: Write `src/shared/game.ts`**

```ts
export type PersistedSession =
  | { status: "lobby" }
  | { status: "playing"; quizId: string; state: unknown };

export type PlayerSnapshot =
  | { status: "lobby"; online: number }
  | {
      status: "playing";
      quizId: string;
      quizType: string;
      rev: number;
      online: number;
      view: unknown;
    };

export type HostSnapshot =
  | { status: "lobby"; online: number }
  | {
      status: "playing";
      quizId: string;
      quizType: string;
      title: string;
      rev: number;
      online: number;
      view: unknown;
    };
```

- [ ] **Step 2: Write `src/server/db/schema.ts` and `drizzle.config.ts`**

```ts
// src/server/db/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { PersistedSession } from "@/shared/game";

export const quiz = sqliteTable("quiz", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const gameSession = sqliteTable("game_session", {
  id: integer("id").primaryKey(),
  data: text("data", { mode: "json" }).$type<PersistedSession>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
```

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
```

Run: `bun run db:generate` — Expected: `drizzle/0000_*.sql` creating `quiz` and `game_session`, plus `drizzle/meta/`.

- [ ] **Step 3: Write `src/server/db/index.ts`**

```ts
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export type Db = BunSQLiteDatabase<typeof schema>;

const MIGRATIONS_DIR = join(import.meta.dir, "../../../drizzle");

export function openDatabase(file: string): { sqlite: Database; db: Db } {
  const sqlite = new Database(file, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { sqlite, db };
}
```

- [ ] **Step 4: Write the failing test `src/server/repo.test.ts`**

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { makeContent } from "@/test/fixtures";
import { openDatabase } from "./db";
import { createQuizRepo, createSessionStore, type QuizRepo, type SessionStore } from "./repo";

let repo: QuizRepo;
let store: SessionStore;
beforeEach(() => {
  const { db } = openDatabase(":memory:");
  repo = createQuizRepo(db);
  store = createSessionStore(db);
});

const rec = { id: "frames", type: "frame-reveal", title: "Угадай кадр", content: makeContent(["a"]) };

describe("quiz repo", () => {
  test("insertIfMissing never overwrites existing content", () => {
    expect(repo.insertIfMissing(rec)).toBe(true);
    expect(repo.insertIfMissing({ ...rec, title: "Другое" })).toBe(false);
    expect(repo.get("frames")?.title).toBe("Угадай кадр");
  });

  test("updateContent changes content and reports unknown ids", () => {
    repo.insertIfMissing(rec);
    const next = makeContent(["a", "b"]);
    expect(repo.updateContent("frames", next)).toBe(true);
    expect(repo.get("frames")?.content).toEqual(next);
    expect(repo.updateContent("missing", next)).toBe(false);
  });

  test("upsert overwrites and list returns records", () => {
    repo.insertIfMissing(rec);
    repo.upsert({ ...rec, title: "Новое" });
    expect(repo.list().map((r) => r.title)).toEqual(["Новое"]);
  });
});

describe("session store", () => {
  test("round-trips the persisted session", () => {
    expect(store.load()).toBeNull();
    store.save({ status: "playing", quizId: "frames", state: { index: 3 } });
    expect(store.load()).toEqual({ status: "playing", quizId: "frames", state: { index: 3 } });
    store.save({ status: "lobby" });
    expect(store.load()).toEqual({ status: "lobby" });
  });
});
```

- [ ] **Step 5: Run** `bun test src/server/repo.test.ts` — Expected: FAIL (module `./repo` not found).

- [ ] **Step 6: Implement `src/server/repo.ts`**

```ts
import { asc, eq } from "drizzle-orm";
import type { PersistedSession } from "@/shared/game";
import type { Db } from "./db";
import { gameSession, quiz } from "./db/schema";

export type QuizRecord = typeof quiz.$inferSelect;
type NewQuiz = Omit<QuizRecord, "updatedAt">;

export function createQuizRepo(db: Db) {
  return {
    list(): QuizRecord[] {
      return db.select().from(quiz).orderBy(asc(quiz.title)).all();
    },
    get(id: string): QuizRecord | undefined {
      return db.select().from(quiz).where(eq(quiz.id, id)).get();
    },
    updateContent(id: string, content: unknown): boolean {
      const rows = db
        .update(quiz)
        .set({ content, updatedAt: new Date() })
        .where(eq(quiz.id, id))
        .returning({ id: quiz.id })
        .all();
      return rows.length > 0;
    },
    insertIfMissing(rec: NewQuiz): boolean {
      const rows = db
        .insert(quiz)
        .values({ ...rec, updatedAt: new Date() })
        .onConflictDoNothing()
        .returning({ id: quiz.id })
        .all();
      return rows.length > 0;
    },
    upsert(rec: NewQuiz): void {
      const updatedAt = new Date();
      db.insert(quiz)
        .values({ ...rec, updatedAt })
        .onConflictDoUpdate({
          target: quiz.id,
          set: { type: rec.type, title: rec.title, content: rec.content, updatedAt },
        })
        .run();
    },
  };
}
export type QuizRepo = ReturnType<typeof createQuizRepo>;

export function createSessionStore(db: Db) {
  return {
    load(): PersistedSession | null {
      return db.select().from(gameSession).where(eq(gameSession.id, 1)).get()?.data ?? null;
    },
    save(data: PersistedSession): void {
      const updatedAt = new Date();
      db.insert(gameSession)
        .values({ id: 1, data, updatedAt })
        .onConflictDoUpdate({ target: gameSession.id, set: { data, updatedAt } })
        .run();
    },
  };
}
export type SessionStore = ReturnType<typeof createSessionStore>;
```

- [ ] **Step 7: Run** `bun test src/server/repo.test.ts` — Expected: PASS.

- [ ] **Step 8: Write the failing test `src/server/seed.test.ts`**

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeContent } from "@/test/fixtures";
import { openDatabase } from "./db";
import { createQuizRepo } from "./repo";
import { loadSeedFiles, seedMissing } from "./seed";

const writeSeed = (dir: string, name: string, body: unknown) =>
  writeFileSync(join(dir, name), JSON.stringify(body));

test("loads valid seeds and inserts only missing quizzes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seed-"));
  writeSeed(dir, "frames.json", {
    id: "frames",
    type: "frame-reveal",
    title: "Угадай кадр",
    content: makeContent(["a"]),
  });
  const seeds = await loadSeedFiles(dir);
  expect(seeds.map((s) => s.id)).toEqual(["frames"]);

  const repo = createQuizRepo(openDatabase(":memory:").db);
  expect(seedMissing(repo, seeds)).toEqual(["frames"]);
  expect(seedMissing(repo, seeds)).toEqual([]);
});

test("rejects seeds with invalid content", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seed-"));
  writeSeed(dir, "bad.json", { id: "bad", type: "frame-reveal", title: "x", content: { slides: 5 } });
  await expect(loadSeedFiles(dir)).rejects.toThrow("bad.json");
});
```

- [ ] **Step 9: Run** `bun test src/server/seed.test.ts` — Expected: FAIL (module `./seed` not found).

- [ ] **Step 10: Implement `src/server/seed.ts`**

```ts
import { join } from "node:path";
import { z } from "zod";
import { getQuizModule } from "@/quizzes/registry.server";
import type { QuizRepo } from "./repo";

const seedFileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  type: z.string(),
  title: z.string().min(1),
  content: z.unknown(),
});
export type SeedFile = z.infer<typeof seedFileSchema>;

export async function loadSeedFiles(dir: string): Promise<SeedFile[]> {
  const files = [...new Bun.Glob("*.json").scanSync({ cwd: dir })].sort();
  const seeds: SeedFile[] = [];
  for (const name of files) {
    try {
      const raw = seedFileSchema.parse(await Bun.file(join(dir, name)).json());
      const content = getQuizModule(raw.type).contentSchema.parse(raw.content);
      seeds.push({ ...raw, content });
    } catch (err) {
      throw new Error(`Invalid seed file ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return seeds;
}

export function seedMissing(repo: QuizRepo, seeds: SeedFile[]): string[] {
  return seeds.filter((s) => repo.insertIfMissing(s)).map((s) => s.id);
}
```

- [ ] **Step 11: Run** `bun test` — Expected: PASS. `bun run check && bun run typecheck`.

- [ ] **Step 12: Commit** — `feat(server): sqlite schema, repositories and seeding`.

---

### Task 5: GameEngine

**Files:**
- Create: `src/server/engine.ts`
- Test: `src/server/engine.test.ts`

**Interfaces:**
- Consumes: `QuizRepo["get"]`, `SessionStore`, `getQuizModule`, snapshot types from `@/shared/game`.
- Produces: `class EngineError extends Error`; `class GameEngine` with `constructor(deps: { repo: Pick<QuizRepo, "get">; store: SessionStore; getModule?: (type: string) => AnyQuizModule; rng?: () => number; log?: (msg: string, err?: unknown) => void })`, methods `start(quizId: string): void`, `stop(): void`, `reset(): void`, `dispatch(action: unknown): void` (throws `ZodError` on invalid action, `EngineError` when no game), `contentChanged(quizId: string): void`, `playerSnapshot(): PlayerSnapshot`, `hostSnapshot(): HostSnapshot`, `join(userId: string): () => void`, `get online(): number`, `watch<T>(get: () => T, signal?: AbortSignal): AsyncGenerator<T>`.

- [ ] **Step 1: Write the failing test `src/server/engine.test.ts`**

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import type { FrameRevealHostView, FrameRevealPublicView } from "@/quizzes/frame-reveal/schema";
import { makeContent } from "@/test/fixtures";
import { openDatabase } from "./db";
import { EngineError, GameEngine } from "./engine";
import { createQuizRepo, createSessionStore, type QuizRepo, type SessionStore } from "./repo";

let repo: QuizRepo;
let store: SessionStore;
let engine: GameEngine;
const make = () => new GameEngine({ repo, store, rng: () => 0 });

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
    expect(playerView(engine)).toMatchObject({ index: 1, answer: "Ответ b", animation: "dissolve" });
    const host = engine.hostSnapshot();
    expect(host).toMatchObject({ status: "playing", title: "Угадай кадр" });
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
    repo.updateContent(
      "frames",
      makeContent(["a"], { a: { enabled: false } }),
    );
    engine.contentChanged("frames");
    expect(playerView(engine)).toMatchObject({ total: 0, slide: null });
    engine.dispatch({ type: "next" });
  });

  test("falls back to the lobby when the active quiz disappears", () => {
    engine.start("frames");
    const ghost = new GameEngine({ repo: { get: () => undefined }, store });
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
```

- [ ] **Step 2: Run** `bun test src/server/engine.test.ts` — Expected: FAIL (module `./engine` not found).

- [ ] **Step 3: Implement `src/server/engine.ts`**

```ts
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
```

- [ ] **Step 4: Run** `bun test src/server/engine.test.ts` — Expected: PASS. `bun run check && bun run typecheck`.

- [ ] **Step 5: Commit** — `feat(server): game engine with persistence, presence and change stream`.

---

### Task 6: Env, Better Auth and tRPC router

**Files:**
- Create: `src/server/env.ts`, `src/server/auth.ts`, `src/server/trpc/init.ts`, `src/server/trpc/context.ts`, `src/server/trpc/router.ts`
- Test: `src/server/env.test.ts`, `src/server/trpc/router.test.ts`

**Interfaces:**
- Consumes: `GameEngine`, `EngineError`, `QuizRepo`, `getQuizModule`, `quizModules`.
- Produces (env): `loadEnv(source?: Record<string, string | undefined>): Env`, `type Env = { NODE_ENV; PORT: number; DATA_DIR: string; BETTER_AUTH_URL: string; BETTER_AUTH_SECRET: string; OIDC_ISSUER: string; OIDC_CLIENT_ID?: string; OIDC_CLIENT_SECRET?: string; devBypass: boolean }`.
- Produces (auth): `createAuth(sqlite: Database, env: Env)`, `type Auth`, `migrateAuth(auth: Auth): Promise<void>`.
- Produces (trpc): `type CtxUser = { id: string; name: string; isAnonymous: boolean }`, `type Context = { user: CtxUser | null; engine: GameEngine; repo: QuizRepo }`, `createContextFactory(deps: { auth: Auth; engine: GameEngine; repo: QuizRepo; devBypass: boolean }): (headers: Headers) => Promise<Context>`, `DEV_HOST_COOKIE = "dev_host"`, `appRouter`, `type AppRouter`. Procedures: `me` (query), `game.onState` / `game.onHostState` (subscriptions), `game.start({ quizId })`, `game.stop()`, `game.reset()`, `game.dispatch({ action })`, `quiz.list()`, `quiz.get({ quizId })`, `quiz.update({ quizId, content })`.

- [ ] **Step 1: Write the failing test `src/server/env.test.ts`**

```ts
import { expect, test } from "bun:test";
import { loadEnv } from "./env";

test("development defaults", () => {
  const env = loadEnv({});
  expect(env).toMatchObject({ PORT: 3000, DATA_DIR: "./data", OIDC_ISSUER: "https://sso.brofrong.ru" });
  expect(env.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  expect(env.devBypass).toBe(false);
  expect(loadEnv({ AUTH_DEV_BYPASS: "1" }).devBypass).toBe(true);
});

test("production requires secrets and ignores the dev bypass", () => {
  expect(() => loadEnv({ NODE_ENV: "production" })).toThrow("BETTER_AUTH_SECRET");
  const env = loadEnv({
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: "x".repeat(40),
    OIDC_CLIENT_ID: "id",
    OIDC_CLIENT_SECRET: "secret",
    AUTH_DEV_BYPASS: "1",
  });
  expect(env.devBypass).toBe(false);
  expect(() =>
    loadEnv({ NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(40) }),
  ).toThrow("OIDC_CLIENT_ID");
});
```

- [ ] **Step 2: Run** `bun test src/server/env.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/server/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATA_DIR: z.string().default("./data"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  OIDC_ISSUER: z.url().default("https://sso.brofrong.ru"),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH_DEV_BYPASS: z.enum(["0", "1"]).default("0"),
});

export type Env = Omit<z.infer<typeof schema>, "AUTH_DEV_BYPASS" | "BETTER_AUTH_SECRET"> & {
  BETTER_AUTH_SECRET: string;
  devBypass: boolean;
};

const DEV_SECRET = "dev-only-secret-do-not-use-in-production-0000";

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const { AUTH_DEV_BYPASS, BETTER_AUTH_SECRET, ...e } = schema.parse(source);
  const prod = e.NODE_ENV === "production";
  if (prod && !BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET обязателен в production (минимум 32 символа)");
  }
  if (prod && (!e.OIDC_CLIENT_ID || !e.OIDC_CLIENT_SECRET)) {
    throw new Error("OIDC_CLIENT_ID и OIDC_CLIENT_SECRET обязательны в production");
  }
  return {
    ...e,
    OIDC_ISSUER: e.OIDC_ISSUER.replace(/\/$/, ""),
    BETTER_AUTH_SECRET: BETTER_AUTH_SECRET ?? DEV_SECRET,
    devBypass: !prod && AUTH_DEV_BYPASS === "1",
  };
}
```

- [ ] **Step 4: Run** `bun test src/server/env.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement `src/server/auth.ts`**

```ts
import type { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { anonymous } from "better-auth/plugins/anonymous";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { Env } from "./env";

export const SSO_PROVIDER_ID = "sso";

export function createAuth(sqlite: Database, env: Env) {
  const sso =
    env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET
      ? [
          genericOAuth({
            config: [
              {
                providerId: SSO_PROVIDER_ID,
                discoveryUrl: `${env.OIDC_ISSUER}/.well-known/openid-configuration`,
                clientId: env.OIDC_CLIENT_ID,
                clientSecret: env.OIDC_CLIENT_SECRET,
                scopes: ["openid", "profile", "email"],
                pkce: true,
              },
            ],
          }),
        ]
      : [];
  return betterAuth({
    database: sqlite,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: [env.BETTER_AUTH_URL],
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    telemetry: { enabled: false },
    plugins: [anonymous({ emailDomainName: "guest.party-quiz.local" }), ...sso],
  });
}
export type Auth = ReturnType<typeof createAuth>;

export async function migrateAuth(auth: Auth): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}
```

- [ ] **Step 6: Implement `src/server/trpc/context.ts` and `src/server/trpc/init.ts`**

```ts
// src/server/trpc/context.ts
import type { Auth } from "../auth";
import type { GameEngine } from "../engine";
import type { QuizRepo } from "../repo";

export type CtxUser = { id: string; name: string; isAnonymous: boolean };
export type Context = { user: CtxUser | null; engine: GameEngine; repo: QuizRepo };

export const DEV_HOST_COOKIE = "dev_host";
const DEV_HOST_RE = new RegExp(`(?:^|;\\s*)${DEV_HOST_COOKIE}=1(?:;|$)`);

export function createContextFactory(deps: {
  auth: Auth;
  engine: GameEngine;
  repo: QuizRepo;
  devBypass: boolean;
}) {
  return async (headers: Headers): Promise<Context> => {
    const base = { engine: deps.engine, repo: deps.repo };
    if (deps.devBypass && DEV_HOST_RE.test(headers.get("cookie") ?? "")) {
      return { ...base, user: { id: "dev-host", name: "Dev Host", isAnonymous: false } };
    }
    const session = await deps.auth.api.getSession({ headers });
    const user = session
      ? {
          id: session.user.id,
          name: session.user.name,
          isAnonymous: Boolean(session.user.isAnonymous),
        }
      : null;
    return { ...base, user };
  };
}
```

```ts
// src/server/trpc/init.ts
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
```

- [ ] **Step 7: Write the failing test `src/server/trpc/router.test.ts`**

```ts
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
    const snap = engine.playerSnapshot();
    expect(snap.status === "playing" && (snap.view as FrameRevealPublicView).answer).toBe(
      "Ответ a",
    );
    expect(await code(caller(host).game.dispatch({ action: { type: "boom" } }))).toBe(
      "BAD_REQUEST",
    );
    expect(await code(caller(host).game.start({ quizId: "nope" }))).toBe("BAD_REQUEST");
  });

  test("guest subscription yields the lobby and counts presence", async () => {
    const ac = new AbortController();
    const iterable = await caller(guest).game.onState(undefined, { signal: ac.signal });
    const it = (iterable as AsyncIterable<PlayerSnapshot>)[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.value).toEqual({ status: "lobby", online: 1 });
    ac.abort();
    await it.return?.();
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
    const snap = engine.playerSnapshot();
    expect(snap.status === "playing" && (snap.view as FrameRevealPublicView).slide?.rects).toEqual([
      { x: 0, y: 0, w: 1, h: 1 },
    ]);
  });

  test("list and get return metadata and content", async () => {
    expect(await caller(host).quiz.list()).toEqual([
      { id: "frames", type: "frame-reveal", typeLabel: "Угадай кадр", title: "Угадай кадр", itemCount: 2 },
    ]);
    expect((await caller(host).quiz.get({ quizId: "frames" })).content).toEqual(
      makeContent(["a", "b"]),
    );
    expect(await code(caller(host).quiz.get({ quizId: "nope" }))).toBe("NOT_FOUND");
  });
});
```

- [ ] **Step 8: Run** `bun test src/server/trpc` — Expected: FAIL (module `./router` not found).

- [ ] **Step 9: Implement `src/server/trpc/router.ts`**

```ts
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
    dispatch: hostProcedure
      .input(z.object({ action: z.unknown() }))
      .mutation(({ ctx, input }) => {
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
```

- [ ] **Step 10: Run** `bun test` — Expected: PASS. If `createCaller(...).game.onState()` returns a different shape in tRPC 11.19 (it should be an `AsyncIterable`), adapt only the test helper, not the router. `bun run check && bun run typecheck`.

- [ ] **Step 11: Commit** — `feat(server): env, better-auth and tRPC router`.

---

### Task 7: HTTP/WebSocket server

**Files:**
- Create: `src/server/app.ts`, `src/server/index.ts`, `src/client/player/index.html` (placeholder), `src/client/admin/index.html` (placeholder)
- Test: `src/server/app.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–6.
- Produces: `createServer(opts: { env: Env; pages: { player: RouteHandler; admin: RouteHandler }; contentDir: string; mediaDir: string }): Promise<{ server: Bun.Server; engine: GameEngine; close(): void }>` where `type RouteHandler = Bun.HTMLBundle | ((req: Request) => Response | Promise<Response>)`. Routes: `/`, `/admin`, `/admin/*`, `/api/health`, `/api/auth/*`, `/media/:file`, `/api/dev/host-login` (bypass only), fallback → tRPC HTTP + WS upgrade at `/api/trpc`.

- [ ] **Step 1: Write the failing test `src/server/app.test.ts`**

```ts
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTRPCClient, createWSClient, httpBatchLink, wsLink } from "@trpc/client";
import type { FrameRevealPublicView } from "@/quizzes/frame-reveal/schema";
import type { PlayerSnapshot } from "@/shared/game";
import { makeContent } from "@/test/fixtures";
import { createServer } from "./app";
import { loadEnv } from "./env";
import type { AppRouter } from "./trpc/router";

let app: Awaited<ReturnType<typeof createServer>>;
let base: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "app-"));
  const contentDir = join(root, "content");
  const mediaDir = join(root, "media");
  mkdirSync(contentDir);
  mkdirSync(mediaDir);
  writeFileSync(
    join(contentDir, "frames.json"),
    JSON.stringify({ id: "frames", type: "frame-reveal", title: "Угадай кадр", content: makeContent(["a", "b"]) }),
  );
  writeFileSync(join(mediaDir, "0000000000000001-1280.avif"), "fake");
  app = await createServer({
    env: loadEnv({ PORT: "0", DATA_DIR: join(root, "data"), AUTH_DEV_BYPASS: "1" }),
    pages: { player: () => new Response("player"), admin: () => new Response("admin") },
    contentDir,
    mediaDir,
  });
  base = `http://localhost:${app.server.port}`;
});
afterAll(() => app.close());

test("health, pages and media", async () => {
  expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true });
  expect(await (await fetch(`${base}/admin/anything`)).text()).toBe("admin");
  const media = await fetch(`${base}/media/0000000000000001-1280.avif`);
  expect(media.status).toBe(200);
  expect(media.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect(media.headers.get("content-type")).toBe("image/avif");
  expect((await fetch(`${base}/media/..%2Fapp.db`)).status).toBe(404);
  expect((await fetch(`${base}/media/0000000000000002-1280.avif`)).status).toBe(404);
});

test("guest over WebSocket follows the host in realtime", async () => {
  const signIn = await fetch(`${base}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: "{}",
  });
  const guestCookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  expect(guestCookie).toContain("session_token");

  class CookieWebSocket extends WebSocket {
    constructor(url: string | URL) {
      // Bun extension: custom headers on the upgrade request
      super(url, { headers: { cookie: guestCookie } } as unknown as string[]);
    }
  }
  const wsClient = createWSClient({ url: `${base.replace("http", "ws")}/api/trpc`, WebSocket: CookieWebSocket });
  const guest = createTRPCClient<AppRouter>({ links: [wsLink({ client: wsClient })] });
  const hostClient = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${base}/api/trpc`, headers: { cookie: "dev_host=1" } })],
  });

  const snapshots: PlayerSnapshot[] = [];
  const waitFor = (pred: (s: PlayerSnapshot) => boolean) =>
    new Promise<PlayerSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 3000);
      const check = () => {
        const hit = snapshots.find(pred);
        if (hit) {
          clearTimeout(timer);
          resolve(hit);
        } else setTimeout(check, 10);
      };
      check();
    });
  const sub = guest.game.onState.subscribe(undefined, { onData: (s) => snapshots.push(s) });

  await waitFor((s) => s.status === "lobby" && s.online === 1);
  expect(await hostClient.me.query()).toMatchObject({ isHost: true });
  await hostClient.game.start.mutate({ quizId: "frames" });
  const playing = await waitFor((s) => s.status === "playing");
  expect((playing as { view: FrameRevealPublicView }).view.answer).toBeNull();
  await hostClient.game.dispatch.mutate({ action: { type: "reveal", animation: "shatter" } });
  const revealed = await waitFor(
    (s) => s.status === "playing" && (s.view as FrameRevealPublicView).answer !== null,
  );
  expect((revealed as { view: FrameRevealPublicView }).view.answer).toBe("Ответ a");

  sub.unsubscribe();
  wsClient.close();
});
```

- [ ] **Step 2: Run** `bun test src/server/app.test.ts` — Expected: FAIL (module `./app` not found).

- [ ] **Step 3: Implement `src/server/app.ts`**

```ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { HTMLBundle } from "bun";
import { createBunHttpHandler, createBunWSHandler } from "trpc-bun-adapter";
import { MEDIA_FILE_RE } from "@/shared/media";
import { createAuth, migrateAuth } from "./auth";
import { openDatabase } from "./db";
import { GameEngine } from "./engine";
import type { Env } from "./env";
import { createQuizRepo, createSessionStore } from "./repo";
import { loadSeedFiles, seedMissing } from "./seed";
import { createContextFactory, DEV_HOST_COOKIE } from "./trpc/context";
import { appRouter } from "./trpc/router";

export type RouteHandler = HTMLBundle | ((req: Request) => Response | Promise<Response>);

export type ServerOptions = {
  env: Env;
  pages: { player: RouteHandler; admin: RouteHandler };
  contentDir: string;
  mediaDir: string;
};

const IMMUTABLE = "public, max-age=31536000, immutable";

export async function createServer({ env, pages, contentDir, mediaDir }: ServerOptions) {
  mkdirSync(env.DATA_DIR, { recursive: true });
  const { sqlite, db } = openDatabase(join(env.DATA_DIR, "app.db"));
  const auth = createAuth(sqlite, env);
  await migrateAuth(auth);

  const repo = createQuizRepo(db);
  const seeded = seedMissing(repo, await loadSeedFiles(contentDir));
  if (seeded.length) console.log(`Добавлены викторины из сида: ${seeded.join(", ")}`);

  const engine = new GameEngine({ repo, store: createSessionStore(db) });
  const createContext = createContextFactory({ auth, engine, repo, devBypass: env.devBypass });
  const onError = ({ error, path }: { error: Error; path?: string }) => {
    if ((error as { code?: string }).code === "INTERNAL_SERVER_ERROR") {
      console.error(`tRPC ${path ?? "?"}:`, error);
    }
  };
  const trpcHttp = createBunHttpHandler({
    router: appRouter,
    endpoint: "/api/trpc",
    emitWsUpgrades: true,
    createContext: ({ req }) => createContext(req.headers),
    onError,
  });
  const websocket = createBunWSHandler({
    router: appRouter,
    createContext: ({ req }) => createContext(req.headers),
    onError,
  });

  const serveMedia = async (file: string) => {
    if (!MEDIA_FILE_RE.test(file)) return new Response("Not found", { status: 404 });
    const f = Bun.file(join(mediaDir, file));
    if (!(await f.exists())) return new Response("Not found", { status: 404 });
    return new Response(f, {
      headers: {
        "content-type": file.endsWith(".avif") ? "image/avif" : "image/webp",
        "cache-control": IMMUTABLE,
      },
    });
  };

  const devRoutes = env.devBypass
    ? {
        "/api/dev/host-login": () =>
          new Response(null, {
            status: 302,
            headers: {
              location: "/admin",
              "set-cookie": `${DEV_HOST_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax`,
            },
          }),
      }
    : {};

  const server = Bun.serve({
    port: env.PORT,
    development: env.NODE_ENV !== "production" && { hmr: true, console: true },
    routes: {
      "/": pages.player,
      "/admin": pages.admin,
      "/admin/*": pages.admin,
      "/api/health": () => Response.json({ ok: true }),
      "/api/auth/*": (req) => auth.handler(req),
      "/media/:file": (req) => serveMedia(req.params.file),
      ...devRoutes,
    },
    fetch(req, srv) {
      return trpcHttp(req, srv) ?? new Response("Not found", { status: 404 });
    },
    websocket,
  });

  return {
    server,
    engine,
    close() {
      server.stop(true);
      sqlite.close();
    },
  };
}
```

- [ ] **Step 4: Implement `src/server/index.ts` and placeholder pages**

```ts
// src/server/index.ts
import { join } from "node:path";
import adminPage from "../client/admin/index.html";
import playerPage from "../client/player/index.html";
import { createServer } from "./app";
import { loadEnv } from "./env";

const root = join(import.meta.dir, "../..");
const env = loadEnv();
const { server } = await createServer({
  env,
  pages: { player: playerPage, admin: adminPage },
  contentDir: join(root, "content/quizzes"),
  mediaDir: join(root, "public/media"),
});
console.log(`🎉 Party Quiz: ${server.url}`);
```

```html
<!-- src/client/player/index.html (replaced in Task 11) -->
<!doctype html><html lang="ru"><head><meta charset="UTF-8" /><title>Party Quiz</title></head><body>player</body></html>
```

```html
<!-- src/client/admin/index.html (replaced in Task 12) -->
<!doctype html><html lang="ru"><head><meta charset="UTF-8" /><title>Party Quiz — ведущий</title></head><body>admin</body></html>
```

Also create an empty `content/quizzes/` folder with `.gitkeep` and `public/media/.gitkeep`.

- [ ] **Step 5: Run** `bun test src/server/app.test.ts` — Expected: PASS. If the custom-header `WebSocket` subclass is rejected by tRPC's `WebSocket` option typing, keep the cast; if Bun ignores headers, pass the cookie via `connectionParams` instead is NOT acceptable (server reads cookies) — instead check Bun docs for `new WebSocket(url, { headers })` and fix the subclass.

- [ ] **Step 6: Manual smoke** — `AUTH_DEV_BYPASS=1 bun run dev`, then `curl -s localhost:3000/api/health` → `{"ok":true}`; open `http://localhost:3000/` → "player". Stop the server.

- [ ] **Step 7: Run** `bun test && bun run check && bun run typecheck`. Commit — `feat(server): Bun.serve with auth, tRPC over HTTP+WS and media`.

---

### Task 8: Media import and seed content

**Files:**
- Create: `scripts/media-lib.ts`, `scripts/media-import.ts`, `scripts/seed-reset.ts`
- Test: `scripts/media-lib.test.ts`
- Generate: `public/media/*.avif|webp`, `content/quizzes/frames.json`

**Interfaces:**
- Consumes: `MediaRef`, `mediaFileName`, `frameRevealContentSchema`, `openDatabase`, `createQuizRepo`, `loadSeedFiles`.
- Produces: `parseItems(fetchPy: string): Map<number, { title: string; hide: string }>`, `normalizeRects(rects: PixelRect[], width: number, height: number): Rect[]`, `variantWidths(width: number): number[]`, `type PixelRect = { x: number; y: number; w: number; h: number }`.

Source data (outside the repo, in the parent scratch folder): `../викторина/<stem>.json` (`{ "rects": PixelRect[] }`, stem like `033_Король Лев_1`), originals at `../кадры/<category>/<stem>.jpg`, titles in `../fetch.py` (`ITEMS` tuples `("cat","title","hide","query")`, 1-based index = number prefix of the stem).

- [ ] **Step 1: Write the failing test `scripts/media-lib.test.ts`**

```ts
import { expect, test } from "bun:test";
import { normalizeRects, parseItems, variantWidths } from "./media-lib";

test("parseItems reads ITEMS tuples by 1-based index", () => {
  const src = `ITEMS = [
 ("1_Русское_кино","Брат","наушники/плеер","Брат кадр"),
 ("6_Мемы","This is fine","собаку","this is fine dog meme"),
]`;
  expect(parseItems(src).get(2)).toEqual({ title: "This is fine", hide: "собаку" });
  expect(parseItems(src).size).toBe(2);
});

test("normalizeRects converts pixels to clamped 4-decimal fractions", () => {
  expect(normalizeRects([{ x: 192, y: 108, w: 960, h: 1000 }], 1920, 1080)).toEqual([
    { x: 0.1, y: 0.1, w: 0.5, h: 0.9 },
  ]);
});

test("variantWidths never upscales and dedupes", () => {
  expect(variantWidths(3000)).toEqual([1280, 1920]);
  expect(variantWidths(1500)).toEqual([1280, 1500]);
  expect(variantWidths(800)).toEqual([800]);
});
```

- [ ] **Step 2: Run** `bun test scripts/media-lib.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `scripts/media-lib.ts`**

```ts
import type { Rect } from "@/quizzes/frame-reveal/schema";

export type PixelRect = { x: number; y: number; w: number; h: number };

const TUPLE_RE = /^\s*\("([^"]*)","([^"]*)","([^"]*)","([^"]*)"\),?\s*$/gm;

export function parseItems(fetchPy: string): Map<number, { title: string; hide: string }> {
  const items = new Map<number, { title: string; hide: string }>();
  let i = 0;
  for (const m of fetchPy.matchAll(TUPLE_RE)) {
    i++;
    items.set(i, { title: m[2] ?? "", hide: m[3] ?? "" });
  }
  return items;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function normalizeRects(rects: PixelRect[], width: number, height: number): Rect[] {
  return rects.map((r) => {
    const x = clamp01(r.x / width);
    const y = clamp01(r.y / height);
    return {
      x: round4(x),
      y: round4(y),
      w: round4(Math.min(r.w / width, 1 - x)),
      h: round4(Math.min(r.h / height, 1 - y)),
    };
  });
}

export const VARIANTS = [1280, 1920] as const;

export function variantWidths(width: number): number[] {
  return [...new Set(VARIANTS.map((v) => Math.min(v, width)))].sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run** `bun test scripts/media-lib.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement `scripts/media-import.ts`**

```ts
/**
 * Converts selected frames into compressed media + the frame-reveal seed.
 * Usage: bun scripts/media-import.ts --selection ../викторина --frames ../кадры --items ../fetch.py
 */
import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { frameRevealContentSchema, type Slide } from "@/quizzes/frame-reveal/schema";
import { type MediaFormat, mediaFileName } from "@/shared/media";
import { normalizeRects, type PixelRect, parseItems, variantWidths } from "./media-lib";

const { values } = parseArgs({
  options: {
    selection: { type: "string" },
    frames: { type: "string" },
    items: { type: "string" },
    "out-media": { type: "string", default: "public/media" },
    "out-content": { type: "string", default: "content/quizzes/frames.json" },
  },
});
if (!values.selection || !values.frames || !values.items) {
  console.error("Нужны --selection, --frames и --items");
  process.exit(1);
}
const outMedia = values["out-media"] as string;
mkdirSync(outMedia, { recursive: true });
mkdirSync(join(values["out-content"] as string, ".."), { recursive: true });

const items = parseItems(await Bun.file(values.items).text());
const originals = new Map(
  [...new Bun.Glob("*/*.jpg").scanSync({ cwd: values.frames })].map((p) => [
    basename(p, ".jpg"),
    join(values.frames as string, p),
  ]),
);

const ENCODERS: Record<MediaFormat, (s: sharp.Sharp) => sharp.Sharp> = {
  avif: (s) => s.avif({ quality: 55, effort: 6 }),
  webp: (s) => s.webp({ quality: 75, effort: 5 }),
};

const slides: Slide[] = [];
let bytes = 0;
const selection = [...new Bun.Glob("*.json").scanSync({ cwd: values.selection })].sort();
for (const file of selection) {
  const stem = basename(file, ".json");
  const idx = Number.parseInt(stem.slice(0, 3), 10);
  const variant = stem.split("_").at(-1);
  const item = items.get(idx);
  const src = originals.get(stem);
  if (!item || !src) throw new Error(`Нет данных для ${stem}`);
  const { rects } = (await Bun.file(join(values.selection, file)).json()) as { rects: PixelRect[] };

  const input = await Bun.file(src).bytes();
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 16);
  const meta = await sharp(input).rotate().metadata();
  const width = meta.autoOrient?.width ?? meta.width;
  const height = meta.autoOrient?.height ?? meta.height;
  if (!width || !height) throw new Error(`Не удалось прочитать размер ${src}`);
  const variants = variantWidths(width);

  for (const w of variants) {
    for (const format of ["avif", "webp"] as const) {
      const out = join(outMedia, mediaFileName(hash, w, format));
      if (!(await Bun.file(out).exists())) {
        await ENCODERS[format](sharp(input).rotate().resize({ width: w })).toFile(out);
      }
      bytes += statSync(out).size;
    }
  }

  slides.push({
    id: `f${idx}-${variant}`,
    media: { hash, width, height, variants },
    answer: item.title,
    hint: item.hide,
    rects: normalizeRects(rects, width, height),
    enabled: true,
  });
  console.log(`✓ ${stem}`);
}

const content = frameRevealContentSchema.parse({ slides });
await Bun.write(
  values["out-content"] as string,
  `${JSON.stringify({ id: "frames", type: "frame-reveal", title: "Угадай кадр", content }, null, 2)}\n`,
);
console.log(`Готово: ${slides.length} кадров, медиа ${(bytes / 1024 / 1024).toFixed(1)} МБ`);
```

Note: if `meta.autoOrient` is absent in the installed sharp version, use `meta.width/height` (all sources are landscape JPEGs without EXIF rotation).

- [ ] **Step 6: Implement `scripts/seed-reset.ts`**

```ts
/** Overwrites quizzes in the database with the seed files. Usage: bun scripts/seed-reset.ts [id ...] */
import { join } from "node:path";
import { openDatabase } from "@/server/db";
import { loadEnv } from "@/server/env";
import { createQuizRepo } from "@/server/repo";
import { loadSeedFiles } from "@/server/seed";

const env = loadEnv();
const ids = new Set(process.argv.slice(2));
const repo = createQuizRepo(openDatabase(join(env.DATA_DIR, "app.db")).db);
const seeds = await loadSeedFiles(join(import.meta.dir, "../content/quizzes"));
for (const s of seeds.filter((s) => ids.size === 0 || ids.has(s.id))) {
  repo.upsert(s);
  console.log(`Перезаписано: ${s.id}`);
}
console.log("Перезапусти сервер, если он запущен.");
```

- [ ] **Step 7: Run the import on the real selection**

```bash
bun run media:import -- --selection ../викторина --frames ../кадры --items ../fetch.py
ls public/media | wc -l          # expected: 34 frames × variants × 2 formats (≈ 130)
du -sh public/media              # expected: well under the 16 MB of originals
```

Open two generated files to eyeball quality: `public/media/<hash>-1280.avif` (Read the file / open in browser). Expected per-frame AVIF 1280 ≈ 40–120 KB.

- [ ] **Step 8: Run** `bun test && bun run check && bun run typecheck`. Commit — `feat: media import script and frames seed (34 frames)` (include `public/media` and `content/quizzes/frames.json`).

---

### Task 9: Client foundation (theme, tRPC/auth clients, shared components)

**Files:**
- Modify: `styles/globals.css`
- Create: `src/lib/plural.ts` (+ `plural.test.ts`), `src/client/shared/trpc.ts`, `src/client/shared/auth-client.ts`, `src/client/shared/Providers.tsx`, `src/client/shared/connection.ts`, `src/client/shared/MediaPicture.tsx`, `src/client/shared/Frame.tsx`, `src/client/shared/Preloader.tsx`, `src/client/shared/Lobby.tsx`, `src/client/shared/ConnectionBanner.tsx`, `src/client/shared/FullscreenButton.tsx`, `src/client/shared/wake-lock.ts`, `src/client/shared/use-local-storage.ts`, `src/client/shared/Screens.tsx`, `src/quizzes/client-types.ts`

**Interfaces:**
- Consumes: `AppRouter` (type-only import), `MediaRef`, `mediaSrcSet`.
- Produces: `pluralRu(n, [one, few, many])`; `trpc` (`createTRPCReact<AppRouter>()`); `createClients(): { wsClient; trpcClient; queryClient }`; `authClient`, `ensureGuestSession(): Promise<void>`; `<Providers>`; `useWsClient()`; `useConnectionState(): "connecting" | "connected" | "offline"`; `<MediaPicture media sizes? className? alt? />`; `<Frame media className? boxRef? boxProps? children />` (box has `data-testid="frame-box"`); `<Preloader media={MediaRef[]} />`; `<Lobby online />` (`data-testid="lobby"`); `<ConnectionBanner />`; `<FullscreenButton />`; `useWakeLock(active: boolean)`; `useLocalStorage<T>(key, initial)`; `<Splash />`, `<ErrorScreen message onRetry? />`; `type PlayerModule = { type: string; Player: ComponentType<{ view: unknown }> }`, `type HostConsoleProps = { view: unknown; dispatch(action: unknown): void; busy: boolean; onReset(): void }`, `type EditorProps = { content: unknown; saving: boolean; onSave(content: unknown): Promise<void>; onDirtyChange(dirty: boolean): void }`, `type AdminModule = PlayerModule & { HostConsole; Editor }`.

- [ ] **Step 1: Failing test `src/lib/plural.test.ts`**

```ts
import { expect, test } from "bun:test";
import { pluralRu } from "./plural";

test("russian plural forms", () => {
  const f = ["устройство", "устройства", "устройств"] as const;
  expect([0, 1, 2, 5, 11, 21, 22, 25, 111].map((n) => pluralRu(n, f))).toEqual([
    "устройств", "устройство", "устройства", "устройств", "устройств",
    "устройство", "устройства", "устройств", "устройств",
  ]);
});
```

- [ ] **Step 2: Run** `bun test src/lib/plural.test.ts` — FAIL. **Implement `src/lib/plural.ts`:**

```ts
export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}
```

Run again — PASS.

- [ ] **Step 3: Theme — append to `styles/globals.css`**

```css
.dark {
  --primary: oklch(0.72 0.2 305);
  --primary-foreground: oklch(0.16 0.03 305);
  --ring: oklch(0.72 0.2 305);
  --background: oklch(0.13 0.02 285);
  --card: oklch(0.17 0.025 285);
}

@layer base {
  html,
  body,
  #root {
    height: 100%;
  }
  body {
    @apply bg-background text-foreground antialiased;
    -webkit-tap-highlight-color: transparent;
  }
}

@keyframes party-gradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.party-bg {
  background:
    radial-gradient(circle at 20% 20%, oklch(0.55 0.25 330 / 0.45), transparent 45%),
    radial-gradient(circle at 80% 30%, oklch(0.6 0.2 260 / 0.45), transparent 45%),
    radial-gradient(circle at 50% 90%, oklch(0.65 0.2 50 / 0.35), transparent 50%),
    oklch(0.13 0.02 285);
  background-size: 200% 200%;
  animation: party-gradient 18s ease infinite;
}
```

- [ ] **Step 4: tRPC + auth clients**

```ts
// src/client/shared/trpc.ts
import { QueryClient } from "@tanstack/react-query";
import { createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/trpc/router";

export const trpc = createTRPCReact<AppRouter>();

export function createClients() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const wsClient = createWSClient({
    url: `${proto}//${location.host}/api/trpc`,
    retryDelayMs: (attempt) => Math.min(500 * 2 ** attempt, 5000),
    keepAlive: { enabled: true, intervalMs: 20_000, pongTimeoutMs: 5_000 },
  });
  const trpcClient = trpc.createClient({
    links: [
      splitLink({
        condition: (op) => op.type === "subscription",
        true: wsLink({ client: wsClient }),
        false: httpBatchLink({ url: "/api/trpc" }),
      }),
    ],
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
  });
  return { wsClient, trpcClient, queryClient };
}
export type Clients = ReturnType<typeof createClients>;
```

```ts
// src/client/shared/auth-client.ts
import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });

/** Every guest device gets a silent anonymous session before opening the WebSocket. */
export async function ensureGuestSession(): Promise<void> {
  const { data } = await authClient.getSession();
  if (data) return;
  const res = await authClient.signIn.anonymous();
  if (res.error) throw new Error(res.error.message ?? "Не удалось создать гостевую сессию");
}
```

- [ ] **Step 5: Providers + connection state**

```tsx
// src/client/shared/Providers.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Toaster } from "sonner";
import { type Clients, createClients, trpc } from "./trpc";

const WsContext = createContext<Clients["wsClient"] | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [clients] = useState(createClients);
  return (
    <trpc.Provider client={clients.trpcClient} queryClient={clients.queryClient}>
      <QueryClientProvider client={clients.queryClient}>
        <WsContext.Provider value={clients.wsClient}>
          {children}
          <Toaster theme="dark" richColors position="top-center" />
        </WsContext.Provider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export function useWsClient() {
  const ws = useContext(WsContext);
  if (!ws) throw new Error("useWsClient outside <Providers>");
  return ws;
}
```

```ts
// src/client/shared/connection.ts
import { useSyncExternalStore } from "react";
import { useWsClient } from "./Providers";

export type ConnectionState = "connecting" | "connected" | "offline";

export function useConnectionState(): ConnectionState {
  const ws = useWsClient();
  return useSyncExternalStore(
    (onChange) => {
      const sub = ws.connectionState.subscribe({ next: onChange });
      return () => sub.unsubscribe();
    },
    () => {
      const s = ws.connectionState.get();
      if (s.state === "pending" || s.state === "idle") return "connected";
      return s.error ? "offline" : "connecting";
    },
  );
}
```

(If `connectionState.get()` is not available in 11.19, keep the latest value from `subscribe` in a module-level variable keyed by client — check `node_modules/@trpc/client/dist/*.d.mts` for `BehaviorSubject`.)

- [ ] **Step 6: Media components**

```tsx
// src/client/shared/MediaPicture.tsx
import { cn } from "@/lib/utils";
import { type MediaRef, mediaSrcSet, mediaUrl } from "@/shared/media";

type Props = { media: MediaRef; sizes?: string; className?: string; alt?: string };

export function MediaPicture({ media, sizes = "100vw", className, alt = "" }: Props) {
  const fallback = media.variants[0] ?? media.width;
  return (
    <picture>
      <source type="image/avif" srcSet={mediaSrcSet(media, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={mediaSrcSet(media, "webp")} sizes={sizes} />
      <img
        src={mediaUrl(media, fallback, "webp")}
        alt={alt}
        width={media.width}
        height={media.height}
        decoding="async"
        draggable={false}
        className={cn("select-none", className)}
      />
    </picture>
  );
}
```

```tsx
// src/client/shared/Frame.tsx
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";
import type { MediaRef } from "@/shared/media";
import { MediaPicture } from "./MediaPicture";

type Props = {
  media: MediaRef;
  children?: ReactNode;
  className?: string;
  boxRef?: Ref<HTMLDivElement>;
  boxProps?: HTMLAttributes<HTMLDivElement>;
  sizes?: string;
};

/** Fits the picture into the parent (contain) and gives children a box that matches the image exactly. */
export function Frame({ media, children, className, boxRef, boxProps, sizes }: Props) {
  const ratio = media.width / media.height;
  return (
    <div
      className={cn("relative flex h-full w-full items-center justify-center", className)}
      style={{ containerType: "size" }}
    >
      <div
        {...boxProps}
        ref={boxRef}
        data-testid="frame-box"
        className={cn("relative overflow-hidden rounded-lg shadow-2xl", boxProps?.className)}
        style={{ aspectRatio: `${media.width} / ${media.height}`, width: `min(100cqw, calc(100cqh * ${ratio}))` }}
      >
        <MediaPicture media={media} sizes={sizes} className="absolute inset-0 h-full w-full object-cover" />
        {children}
      </div>
    </div>
  );
}
```

```tsx
// src/client/shared/Preloader.tsx
import type { MediaRef } from "@/shared/media";
import { MediaPicture } from "./MediaPicture";

/** Off-screen pictures with the same sources/sizes as the real ones, so the browser caches exactly the right file. */
export function Preloader({ media, sizes }: { media: MediaRef[]; sizes?: string }) {
  return (
    <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0">
      {media.map((m) => (
        <MediaPicture key={m.hash} media={m} sizes={sizes} />
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Screens, lobby, banner, fullscreen, wake lock, local storage**

```tsx
// src/client/shared/Screens.tsx
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Splash() {
  return (
    <div className="party-bg flex h-full items-center justify-center">
      <Loader2 className="size-10 animate-spin text-white/80" />
    </div>
  );
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg">{message}</p>
      {onRetry && <Button onClick={onRetry}>Попробовать ещё раз</Button>}
    </div>
  );
}
```

```tsx
// src/client/shared/Lobby.tsx
import { motion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { pluralRu } from "@/lib/plural";

export function Lobby({ online }: { online: number }) {
  const url = location.origin;
  const [qr, setQr] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: "M" }).then(setQr);
  }, [url]);
  return (
    <div data-testid="lobby" className="party-bg flex h-full flex-col items-center justify-center gap-6 p-6 text-center text-white">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-black tracking-tight sm:text-6xl"
      >
        Party Quiz 🎉
      </motion.h1>
      <p className="text-lg text-white/80 sm:text-2xl">Наведи камеру на QR-код, чтобы присоединиться</p>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.4 }}
        className="rounded-3xl bg-white p-4 shadow-2xl"
      >
        {qr ? (
          <img src={qr} alt="QR-код для входа" className="size-[min(70vw,46vh)]" />
        ) : (
          <div className="size-[min(70vw,46vh)]" />
        )}
      </motion.div>
      <p className="font-mono text-xl sm:text-3xl">{url.replace(/^https?:\/\//, "")}</p>
      <div className="flex items-center gap-3 rounded-full bg-black/30 px-5 py-2 text-white/90 backdrop-blur">
        <span className="relative flex size-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-emerald-400" />
        </span>
        Ждём начала · {online} {pluralRu(online, ["устройство", "устройства", "устройств"])}
      </div>
    </div>
  );
}
```

```tsx
// src/client/shared/ConnectionBanner.tsx
import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useConnectionState } from "./connection";

export function ConnectionBanner() {
  const state = useConnectionState();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (state === "connected") return setShow(false);
    const t = setTimeout(() => setShow(true), 1200); // no flicker on quick reconnects
    return () => clearTimeout(t);
  }, [state]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-3 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm text-white shadow-lg"
        >
          <WifiOff className="size-4" /> Нет связи, переподключаемся…
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

```tsx
// src/client/shared/FullscreenButton.tsx
import { Maximize, Minimize } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function FullscreenButton() {
  const [visible, setVisible] = useState(true);
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    let t = setTimeout(() => setVisible(false), 3000);
    const wake = () => {
      setVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setVisible(false), 3000);
    };
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener("pointermove", wake);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);
  if (!document.documentElement.requestFullscreen) return null;
  return (
    <button
      type="button"
      aria-label={full ? "Выйти из полноэкранного режима" : "На весь экран"}
      onClick={() =>
        full ? document.exitFullscreen() : document.documentElement.requestFullscreen()
      }
      className={cn(
        "fixed right-4 bottom-4 z-40 rounded-full bg-black/50 p-3 text-white backdrop-blur transition-opacity",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
    </button>
  );
}
```

```ts
// src/client/shared/wake-lock.ts
import { useEffect } from "react";

/** Keeps phone screens on while a game is running (no-op where unsupported). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === "visible") {
        navigator.wakeLock.request("screen").then((l) => {
          lock = l;
        }, () => {});
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
```

```ts
// src/client/shared/use-local-storage.ts
import { useState } from "react";

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    localStorage.setItem(key, JSON.stringify(v));
  };
  return [value, set] as const;
}
```

- [ ] **Step 8: Client module contract `src/quizzes/client-types.ts`**

```ts
import type { ComponentType } from "react";

export type PlayerModule = { type: string; Player: ComponentType<{ view: unknown }> };

export type HostConsoleProps = {
  view: unknown;
  dispatch: (action: unknown) => void;
  busy: boolean;
  onReset: () => void;
};

export type EditorProps = {
  content: unknown;
  saving: boolean;
  onSave: (content: unknown) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
};

export type AdminModule = PlayerModule & {
  HostConsole: ComponentType<HostConsoleProps>;
  Editor: ComponentType<EditorProps>;
};
```

- [ ] **Step 9: Verify** `bun test && bun run check && bun run typecheck`. Commit — `feat(client): theme, tRPC/auth clients and shared components`.

---

### Task 10: Cover reveal animations

**Files:**
- Create: `src/quizzes/frame-reveal/client/geometry.ts` (+ `geometry.test.ts`), `src/quizzes/frame-reveal/client/Cover.tsx`

**Interfaces:**
- Consumes: `seededRandom`, `shuffle`, `Rect`, `RevealAnimation`.
- Produces: `buildShards(seed: string, count?: number): Shard[]` with `type Shard = { points: [number, number][]; cx: number; cy: number; dx: number; dy: number; rotate: number; delay: number }`; `<Cover rect phase animation seed />` (root has `data-testid="cover"`; renders nothing if mounted already revealed).

- [ ] **Step 1: Failing test `geometry.test.ts`**

```ts
import { expect, test } from "bun:test";
import { buildShards } from "./geometry";

const area = (pts: [number, number][]) =>
  Math.abs(pts.reduce((s, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length] as [number, number];
    return s + x * ny - nx * y;
  }, 0)) / 2;

test("shards are deterministic and tile the whole cover", () => {
  const a = buildShards("f33-1:0", 12);
  expect(a).toEqual(buildShards("f33-1:0", 12));
  expect(a).toHaveLength(12);
  expect(a.reduce((s, sh) => s + area(sh.points), 0)).toBeCloseTo(1, 6);
  expect(buildShards("other", 12)).not.toEqual(a);
});
```

- [ ] **Step 2: Run** — FAIL. **Implement `geometry.ts`:**

```ts
import { seededRandom } from "@/shared/random";

export type Shard = {
  points: [number, number][];
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  rotate: number;
  delay: number;
};

/** Point on the unit-square perimeter, t in [0, 4): top, right, bottom, left. */
function perimeter(t: number): [number, number] {
  const edge = Math.floor(t) % 4;
  const f = t - Math.floor(t);
  if (edge === 0) return [f, 0];
  if (edge === 1) return [1, f];
  if (edge === 2) return [1 - f, 1];
  return [0, 1 - f];
}

/** Triangles fanning out of a random impact point; corners are always breakpoints so they tile the square. */
export function buildShards(seed: string, count = 12): Shard[] {
  const rng = seededRandom(seed);
  const c: [number, number] = [0.35 + rng() * 0.3, 0.35 + rng() * 0.3];
  const ts = [0, 1, 2, 3, ...Array.from({ length: Math.max(0, count - 4) }, () => rng() * 4)].sort(
    (a, b) => a - b,
  );
  return ts.map((t, i) => {
    const next = i + 1 < ts.length ? (ts[i + 1] as number) : 4;
    const a = perimeter(t);
    const b = perimeter(next);
    const cx = (c[0] + a[0] + b[0]) / 3;
    const cy = (c[1] + a[1] + b[1]) / 3;
    return {
      points: [c, a, b],
      cx,
      cy,
      dx: (cx - c[0]) * (1.2 + rng() * 1.6),
      dy: 0.9 + rng() * 0.9,
      rotate: (rng() - 0.5) * 140,
      delay: rng() * 0.12,
    };
  });
}
```

Run — PASS.

- [ ] **Step 3: Implement `Cover.tsx`**

```tsx
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useRef } from "react";
import { seededRandom, shuffle } from "@/shared/random";
import type { Rect, RevealAnimation } from "../schema";
import { buildShards } from "./geometry";

const pct = (n: number) => `${n * 100}%`;

type Props = { rect: Rect; phase: "hidden" | "revealed"; animation: RevealAnimation; seed: string };

export function Cover({ rect, phase, animation, seed }: Props) {
  const reduced = useReducedMotion();
  // A screen that joins after the reveal must not replay the animation.
  const mountedRevealed = useRef(phase === "revealed");
  if (phase === "hidden") mountedRevealed.current = false;
  if (phase === "revealed" && mountedRevealed.current) return null;
  return (
    <div
      data-testid="cover"
      className="pointer-events-none absolute"
      style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
    >
      {phase === "hidden" ? (
        <div className="absolute inset-0 bg-black" />
      ) : (
        <Reveal animation={reduced ? "dissolve" : animation} seed={seed} />
      )}
    </div>
  );
}

function Reveal({ animation, seed }: { animation: RevealAnimation; seed: string }) {
  const block = "absolute inset-0 bg-black";
  switch (animation) {
    case "dissolve":
      return (
        <motion.div
          className={block}
          initial={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
          animate={{ opacity: 0, filter: "blur(18px)", scale: 1.08 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      );
    case "collapse":
      return (
        <motion.div
          className={block}
          initial={{ scale: 1, rotate: 0, opacity: 1 }}
          animate={{ scale: 0, rotate: 200, opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.6, -0.28, 0.74, 0.05] }}
        />
      );
    case "flyaway":
      return (
        <motion.div
          className={block}
          initial={{ x: 0, y: 0, rotate: 0 }}
          animate={{ x: "160%", y: "-140%", rotate: 35, opacity: 0 }}
          transition={{ duration: 0.9, ease: [0.5, 0, 0.75, 0] }}
        />
      );
    case "curtain":
      return (
        <>
          <motion.div
            className="absolute inset-y-0 left-0 w-[50.5%] bg-black"
            animate={{ x: "-101%" }}
            transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 w-[50.5%] bg-black"
            animate={{ x: "101%" }}
            transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1], delay: 0.05 }}
          />
        </>
      );
    case "pixels":
      return <Pixels seed={seed} />;
    case "shatter":
      return <Shatter seed={seed} />;
  }
}

const GRID = 8;

function Pixels({ seed }: { seed: string }) {
  const order = useMemo(
    () => shuffle(Array.from({ length: GRID * GRID }, (_, i) => i), seededRandom(seed)),
    [seed],
  );
  return (
    <>
      {order.map((cell, rank) => (
        <motion.div
          key={cell}
          className="absolute bg-black"
          style={{
            left: pct((cell % GRID) / GRID),
            top: pct(Math.floor(cell / GRID) / GRID),
            width: `calc(${100 / GRID}% + 1px)`,
            height: `calc(${100 / GRID}% + 1px)`,
          }}
          animate={{ opacity: 0, scale: 0.3 }}
          transition={{ delay: (rank / (GRID * GRID)) * 0.9, duration: 0.22, ease: "easeIn" }}
        />
      ))}
    </>
  );
}

function Shatter({ seed }: { seed: string }) {
  const shards = useMemo(() => buildShards(seed, 12), [seed]);
  return (
    <>
      {shards.map((s) => (
        <motion.div
          key={`${s.cx}:${s.cy}`}
          className="absolute inset-0 bg-black"
          style={{
            clipPath: `polygon(${s.points.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(", ")})`,
            transformOrigin: `${s.cx * 100}% ${s.cy * 100}%`,
          }}
          animate={{ x: pct(s.dx), y: pct(s.dy), rotate: s.rotate, opacity: 0 }}
          transition={{
            delay: 0.12 + s.delay,
            duration: 1.1,
            ease: [0.55, 0, 1, 0.45],
            opacity: { delay: 0.6 + s.delay, duration: 0.6 },
          }}
        />
      ))}
      <motion.div
        className="absolute inset-0 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 0.25 }}
      />
    </>
  );
}
```

- [ ] **Step 4: Verify** `bun test && bun run check && bun run typecheck`. Commit — `feat(frame-reveal): six cover reveal animations`.

---

### Task 11: Player app (guests and TV)

**Files:**
- Create: `src/quizzes/frame-reveal/client/Player.tsx`, `src/quizzes/frame-reveal/client/player-module.ts`, `src/quizzes/registry.player.ts`
- Replace: `src/client/player/index.html`; create `src/client/player/main.tsx`, `src/client/player/App.tsx`

**Interfaces:**
- Consumes: Task 9 shared components, `Cover`, `FrameRevealPublicView`, `PlayerSnapshot`.
- Produces: `<FrameRevealPlayer view />` (counter `data-testid="slide-counter"` with text `"<n> / <total>"`, answer `data-testid="answer"`), `frameRevealPlayerModule: PlayerModule`, `getPlayerModule(type): PlayerModule | undefined`.

- [ ] **Step 1: `Player.tsx`**

```tsx
import { AnimatePresence, motion } from "motion/react";
import { Frame } from "@/client/shared/Frame";
import { Preloader } from "@/client/shared/Preloader";
import type { FrameRevealPublicView } from "../schema";
import { Cover } from "./Cover";

export function FrameRevealPlayer({ view: raw }: { view: unknown }) {
  const view = raw as FrameRevealPublicView;
  if (!view.slide) {
    return (
      <div className="flex h-full items-center justify-center text-xl text-muted-foreground">
        В викторине нет кадров
      </div>
    );
  }
  const slide = view.slide;
  return (
    <div className="flex h-full w-full flex-col gap-3 p-3 sm:p-6">
      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={slide.id}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.45 }}
          >
            <Frame media={slide.media}>
              {slide.rects.map((r, i) => (
                <Cover
                  key={`${r.x}:${r.y}:${r.w}:${r.h}`}
                  rect={r}
                  phase={view.phase}
                  animation={view.animation}
                  seed={`${slide.id}:${i}`}
                />
              ))}
            </Frame>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex min-h-14 items-center justify-center gap-4">
        <span
          data-testid="slide-counter"
          className="rounded-full bg-white/10 px-3 py-1 font-mono text-sm text-white/70 tabular-nums"
        >
          {view.index + 1} / {view.total}
        </span>
        <AnimatePresence mode="wait">
          {view.answer && (
            <motion.div
              key={slide.id}
              data-testid="answer"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.5, type: "spring", bounce: 0.35 }}
              className="rounded-2xl bg-primary px-5 py-2 text-center text-xl font-bold text-primary-foreground shadow-lg sm:text-3xl"
            >
              {view.answer}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Preloader media={view.preload} />
    </div>
  );
}
```

- [ ] **Step 2: `player-module.ts` and `registry.player.ts`**

```ts
// src/quizzes/frame-reveal/client/player-module.ts
import type { PlayerModule } from "../../client-types";
import { FrameRevealPlayer } from "./Player";

export const frameRevealPlayerModule: PlayerModule = { type: "frame-reveal", Player: FrameRevealPlayer };
```

```ts
// src/quizzes/registry.player.ts — guest bundle: Player components only
import type { PlayerModule } from "./client-types";
import { frameRevealPlayerModule } from "./frame-reveal/client/player-module";

const modules: PlayerModule[] = [frameRevealPlayerModule];
const byType = new Map(modules.map((m) => [m.type, m]));
export const getPlayerModule = (type: string) => byType.get(type);
```

- [ ] **Step 3: Player entry files**

```html
<!-- src/client/player/index.html -->
<!doctype html>
<html lang="ru" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0f0d1a" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎉</text></svg>" />
    <title>Party Quiz</title>
    <script type="module" src="./main.tsx" async></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

```tsx
// src/client/player/main.tsx
import "../../../styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");
(import.meta.hot.data.root ??= createRoot(el)).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

```tsx
// src/client/player/App.tsx
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { ensureGuestSession } from "@/client/shared/auth-client";
import { ConnectionBanner } from "@/client/shared/ConnectionBanner";
import { FullscreenButton } from "@/client/shared/FullscreenButton";
import { Lobby } from "@/client/shared/Lobby";
import { Providers } from "@/client/shared/Providers";
import { ErrorScreen, Splash } from "@/client/shared/Screens";
import { trpc } from "@/client/shared/trpc";
import { useWakeLock } from "@/client/shared/wake-lock";
import { getPlayerModule } from "@/quizzes/registry.player";
import type { PlayerSnapshot } from "@/shared/game";

export function App() {
  const [status, setStatus] = useState<"pending" | "ready" | "error">("pending");
  const start = useCallback(() => {
    setStatus("pending");
    ensureGuestSession().then(
      () => setStatus("ready"),
      () => setStatus("error"),
    );
  }, []);
  useEffect(start, []);
  if (status === "error") {
    return <ErrorScreen message="Не получилось подключиться к игре" onRetry={start} />;
  }
  if (status === "pending") return <Splash />;
  return (
    <Providers>
      <PlayerRoot />
    </Providers>
  );
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

function PlayerRoot() {
  const [snap, setSnap] = useState<PlayerSnapshot | null>(null);
  trpc.game.onState.useSubscription(undefined, { onData: setSnap });
  useWakeLock(snap?.status === "playing");
  const Player = snap?.status === "playing" ? getPlayerModule(snap.quizType)?.Player : undefined;
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <AnimatePresence mode="wait">
        {!snap ? (
          <motion.div key="splash" className="h-full" {...fade}>
            <Splash />
          </motion.div>
        ) : snap.status === "lobby" ? (
          <motion.div key="lobby" className="h-full" {...fade}>
            <Lobby online={snap.online} />
          </motion.div>
        ) : (
          <motion.div key={`game:${snap.quizId}`} className="h-full" {...fade}>
            {Player ? (
              <Player view={snap.view} />
            ) : (
              <ErrorScreen message="Эта викторина не поддерживается — обнови страницу" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <ConnectionBanner />
      <FullscreenButton />
    </main>
  );
}
```

- [ ] **Step 4: Manual check** — `AUTH_DEV_BYPASS=1 bun run dev`; open `http://localhost:3000` → lobby with QR and "Ждём начала · 1 устройство". In another terminal start a game through the API to see the player:

```bash
curl -s -X POST localhost:3000/api/trpc/game.start -H 'content-type: application/json' -H 'cookie: dev_host=1' -d '{"quizId":"frames"}'
curl -s -X POST localhost:3000/api/trpc/game.dispatch -H 'content-type: application/json' -H 'cookie: dev_host=1' -d '{"action":{"type":"reveal","animation":"shatter"}}'
```

Expected: the page switches to the first frame with black covers, then the covers shatter and the answer plaque appears. Check DevTools Network: frame is `.avif`, < 150 KB; next two frames are already loaded. Screenshot phone (390×844) and TV (1920×1080) viewports (headless Chrome via puppeteer-core is fine) and look at them.

- [ ] **Step 5: Verify** `bun run check && bun run typecheck && bun test`. Commit — `feat(player): guest/TV screens with lobby QR, frames and reveal`.

---

### Task 12: Admin app — login, quiz list, host console

**Files:**
- Create: `src/quizzes/frame-reveal/client/HostConsole.tsx`, `src/quizzes/frame-reveal/client/admin-module.ts`, `src/quizzes/registry.admin.ts`
- Replace: `src/client/admin/index.html`; create `src/client/admin/main.tsx`, `App.tsx`, `Login.tsx`, `HostShell.tsx`, `QuizList.tsx`, `ConsoleScreen.tsx`

**Interfaces:**
- Consumes: Task 9/11 components; tRPC procedures `me`, `game.*`, `quiz.list`.
- Produces: `frameRevealAdminModule: AdminModule` (Editor added in Task 13 — until then point `Editor` at a stub that renders "Скоро"), `getAdminModule(type): AdminModule | undefined`, test ids: `start-<quizId>`, `host-answer`, `toggle-reveal`.

- [ ] **Step 1: `HostConsole.tsx`**

```tsx
import { ChevronLeft, ChevronRight, EyeOff, RotateCcw, Shuffle, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Frame } from "@/client/shared/Frame";
import { MediaPicture } from "@/client/shared/MediaPicture";
import { Preloader } from "@/client/shared/Preloader";
import { useLocalStorage } from "@/client/shared/use-local-storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { HostConsoleProps } from "../../client-types";
import {
  ANIMATION_LABELS,
  type FrameRevealAction,
  type FrameRevealHostView,
  REVEAL_ANIMATIONS,
  type RevealAnimation,
} from "../schema";
import { FrameRevealPlayer } from "./Player";

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function FrameRevealHostConsole({ view: raw, dispatch, busy, onReset }: HostConsoleProps) {
  const view = raw as FrameRevealHostView;
  const send = (a: FrameRevealAction) => dispatch(a);
  const [anim, setAnim] = useLocalStorage<RevealAnimation | "random">("reveal-animation", "random");
  const revealed = view.phase === "revealed";
  const toggle = () => send(revealed ? { type: "hide" } : { type: "reveal", animation: anim });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat) return;
      if (e.key === "ArrowRight") send({ type: "next" });
      else if (e.key === "ArrowLeft") send({ type: "prev" });
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggle();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const neighbours = view.slides.slice(Math.max(0, view.index - 1), view.index + 3).map((s) => s.media);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Видят гости</CardTitle>
          </CardHeader>
          <CardContent className="h-[38vh] p-0">
            <FrameRevealPlayer view={view} />
          </CardContent>
        </Card>
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Оригинал</CardTitle>
          </CardHeader>
          <CardContent className="h-[38vh] p-3 sm:p-6">
            {view.slide && <Frame media={view.slide.media} />}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Ответ · кадр {view.total ? view.index + 1 : 0} из {view.total}
            </div>
            <div data-testid="host-answer" className="truncate text-3xl font-bold">
              {view.currentAnswer ?? "—"}
            </div>
            {view.currentHint && (
              <div className="text-muted-foreground">Закрыто: {view.currentHint}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" aria-label="Предыдущий кадр" disabled={busy || view.index === 0} onClick={() => send({ type: "prev" })}>
              <ChevronLeft />
            </Button>
            <Button size="lg" data-testid="toggle-reveal" className="min-w-40" disabled={busy || !view.slide} onClick={toggle}>
              {revealed ? (<><EyeOff /> Закрыть</>) : (<><Sparkles /> Открыть</>)}
            </Button>
            <Button variant="outline" size="lg" aria-label="Следующий кадр" disabled={busy || view.index >= view.total - 1} onClick={() => send({ type: "next" })}>
              <ChevronRight />
            </Button>
          </div>
        </CardContent>
        <Separator />
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <span className="text-sm text-muted-foreground">Анимация:</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={anim}
            onValueChange={(v) => v && setAnim(v as RevealAnimation | "random")}
            className="flex-wrap"
          >
            <ToggleGroupItem value="random">
              <Shuffle /> Случайная
            </ToggleGroupItem>
            {REVEAL_ANIMATIONS.map((a) => (
              <ToggleGroupItem key={a} value={a}>
                {ANIMATION_LABELS[a]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">← → листать · пробел открыть</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.confirm("Начать викторину с первого кадра?") && onReset()}
          >
            <RotateCcw /> Сначала
          </Button>
        </CardContent>
      </Card>

      <ScrollArea className="w-full whitespace-nowrap rounded-xl border">
        <div className="flex gap-2 p-2">
          {view.slides.map((s, i) => (
            <button
              type="button"
              key={s.id}
              title={s.answer}
              onClick={() => send({ type: "goto", index: i })}
              className={cn(
                "relative aspect-video h-20 shrink-0 overflow-hidden rounded-md border-2 transition",
                i === view.index ? "border-primary" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              <MediaPicture media={s.media} sizes="160px" className="h-full w-full object-cover" />
              <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 text-xs text-white">{i + 1}</span>
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <Preloader media={neighbours} />
    </div>
  );
}
```

- [ ] **Step 2: `admin-module.ts` and `registry.admin.ts`**

```ts
// src/quizzes/frame-reveal/client/admin-module.ts
import type { AdminModule } from "../../client-types";
import { FrameRevealEditor } from "./Editor";
import { FrameRevealHostConsole } from "./HostConsole";
import { FrameRevealPlayer } from "./Player";

export const frameRevealAdminModule: AdminModule = {
  type: "frame-reveal",
  Player: FrameRevealPlayer,
  HostConsole: FrameRevealHostConsole,
  Editor: FrameRevealEditor,
};
```

Until Task 13, create `src/quizzes/frame-reveal/client/Editor.tsx` as:
```tsx
export function FrameRevealEditor() {
  return <p className="text-muted-foreground">Редактор появится в следующей задаче</p>;
}
```

```ts
// src/quizzes/registry.admin.ts — host bundle
import type { AdminModule } from "./client-types";
import { frameRevealAdminModule } from "./frame-reveal/client/admin-module";

const modules: AdminModule[] = [frameRevealAdminModule];
const byType = new Map(modules.map((m) => [m.type, m]));
export const getAdminModule = (type: string) => byType.get(type);
```

- [ ] **Step 3: Admin entry (`index.html`, `main.tsx`)** — copy the player versions, change `<title>` to `Party Quiz — ведущий`. `main.tsx` identical except it imports `./App` from the admin folder.

- [ ] **Step 4: `App.tsx`, `Login.tsx`**

```tsx
// src/client/admin/App.tsx
import { Providers } from "@/client/shared/Providers";
import { ErrorScreen, Splash } from "@/client/shared/Screens";
import { trpc } from "@/client/shared/trpc";
import { HostShell } from "./HostShell";
import { Login } from "./Login";

export function App() {
  return (
    <Providers>
      <AdminRoot />
    </Providers>
  );
}

function AdminRoot() {
  const me = trpc.me.useQuery();
  if (me.isPending) return <Splash />;
  if (me.error) return <ErrorScreen message="Сервер недоступен" onRetry={() => me.refetch()} />;
  if (!me.data.isHost) return <Login />;
  return <HostShell userName={me.data.user?.name ?? ""} />;
}
```

```tsx
// src/client/admin/Login.tsx
import { LogIn } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/client/shared/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Login() {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    const res = await authClient.signIn.social({ provider: "sso", callbackURL: "/admin" });
    if (res.error) {
      toast.error(res.error.message ?? "Не удалось начать вход");
      setBusy(false);
    }
  };
  return (
    <div className="party-bg flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Party Quiz 🎉</CardTitle>
          <CardDescription>Панель ведущего. Войди, чтобы управлять викторинами.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button size="lg" onClick={signIn} disabled={busy}>
            <LogIn /> Войти через SSO
          </Button>
          {location.hostname === "localhost" && (
            <Button variant="link" asChild>
              <a href="/api/dev/host-login">Dev-вход (AUTH_DEV_BYPASS=1)</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

If TypeScript rejects `provider: "sso"` (social provider union), add `genericOAuthClient()` from `better-auth/client/plugins` to `authClient` plugins; if still rejected, cast `"sso" as never` with a short comment.

- [ ] **Step 5: `HostShell.tsx`, `QuizList.tsx`, `ConsoleScreen.tsx`**

```tsx
// src/client/admin/HostShell.tsx
import { LogOut, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/client/shared/auth-client";
import { ConnectionBanner } from "@/client/shared/ConnectionBanner";
import { trpc } from "@/client/shared/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HostSnapshot } from "@/shared/game";
import { ConsoleScreen } from "./ConsoleScreen";
import { EditorScreen } from "./EditorScreen";
import { QuizList } from "./QuizList";

type Screen = { kind: "home" } | { kind: "console" } | { kind: "editor"; quizId: string };

export function HostShell({ userName }: { userName: string }) {
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "console" });
  trpc.game.onHostState.useSubscription(undefined, {
    onData: setSnap,
    onError: (e) => toast.error(e.message),
  });
  const stop = trpc.game.stop.useMutation({ onError: (e) => toast.error(e.message) });
  const playing = snap?.status === "playing" ? snap : null;
  const view: Screen = screen.kind === "console" && !playing ? { kind: "home" } : screen;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
        <button type="button" className="font-bold" onClick={() => setScreen({ kind: "home" })}>
          🎉 Party Quiz
        </button>
        <Badge variant={playing ? "default" : "secondary"}>
          {playing ? `Идёт: ${playing.title}` : "Лобби"}
        </Badge>
        <span className="flex items-center gap-1 text-sm text-muted-foreground" title="Подключено гостей">
          <Users className="size-4" /> {snap?.online ?? 0}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {playing && view.kind !== "console" && (
            <Button size="sm" onClick={() => setScreen({ kind: "console" })}>Открыть пульт</Button>
          )}
          {playing && (
            <Button size="sm" variant="outline" onClick={() => stop.mutate()}>В лобби</Button>
          )}
          <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Выйти"
            onClick={() => authClient.signOut().finally(() => location.reload())}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4">
        {view.kind === "home" && (
          <QuizList
            playingId={playing?.quizId}
            onOpenConsole={() => setScreen({ kind: "console" })}
            onEdit={(quizId) => setScreen({ kind: "editor", quizId })}
          />
        )}
        {view.kind === "console" && playing && <ConsoleScreen snapshot={playing} />}
        {view.kind === "editor" && (
          <EditorScreen quizId={view.quizId} onClose={() => setScreen({ kind: "home" })} />
        )}
      </main>
      <ConnectionBanner />
    </div>
  );
}
```

```tsx
// src/client/admin/QuizList.tsx
import { Pencil, Play, Radio } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/client/shared/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pluralRu } from "@/lib/plural";

type Props = { playingId?: string; onOpenConsole: () => void; onEdit: (quizId: string) => void };

export function QuizList({ playingId, onOpenConsole, onEdit }: Props) {
  const list = trpc.quiz.list.useQuery();
  const start = trpc.game.start.useMutation({
    onSuccess: onOpenConsole,
    onError: (e) => toast.error(e.message),
  });
  if (list.isPending) return <Skeleton className="h-40 w-full max-w-md" />;
  if (list.error) return <p className="text-destructive">{list.error.message}</p>;
  return (
    <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.data.map((q) => (
        <Card key={q.id}>
          <CardHeader>
            <Badge variant="secondary" className="w-fit">{q.typeLabel}</Badge>
            <CardTitle className="text-xl">{q.title}</CardTitle>
            <CardDescription>
              {q.itemCount} {pluralRu(q.itemCount, ["вопрос", "вопроса", "вопросов"])}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {playingId === q.id ? (
              <Button onClick={onOpenConsole}><Radio /> Открыть пульт</Button>
            ) : (
              <Button
                data-testid={`start-${q.id}`}
                disabled={start.isPending}
                onClick={() => start.mutate({ quizId: q.id })}
              >
                <Play /> Запустить
              </Button>
            )}
            <Button variant="outline" onClick={() => onEdit(q.id)}><Pencil /> Редактировать</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

```tsx
// src/client/admin/ConsoleScreen.tsx
import { toast } from "sonner";
import { trpc } from "@/client/shared/trpc";
import { getAdminModule } from "@/quizzes/registry.admin";
import type { HostSnapshot } from "@/shared/game";

export function ConsoleScreen({ snapshot }: { snapshot: Extract<HostSnapshot, { status: "playing" }> }) {
  const onError = (e: { message: string }) => toast.error(e.message);
  const dispatch = trpc.game.dispatch.useMutation({ onError });
  const reset = trpc.game.reset.useMutation({ onError });
  const m = getAdminModule(snapshot.quizType);
  if (!m) return <p>Неизвестный тип викторины: {snapshot.quizType}</p>;
  return (
    <m.HostConsole
      view={snapshot.view}
      busy={dispatch.isPending}
      dispatch={(action) => dispatch.mutate({ action })}
      onReset={() => reset.mutate()}
    />
  );
}
```

For this task create `EditorScreen.tsx` as a minimal screen (full version in Task 13):
```tsx
export function EditorScreen({ onClose }: { quizId: string; onClose: () => void }) {
  return <button type="button" onClick={onClose}>Назад</button>;
}
```

- [ ] **Step 6: Manual check** — `AUTH_DEV_BYPASS=1 bun run dev`; open `/admin` → login card; click "Dev-вход" → quiz list with "Угадай кадр · 34 вопроса"; "Запустить" → console. In a second window open `/`. Space reveals with the selected animation, arrows navigate, thumbnails jump, "В лобби" returns guests to the QR. Without the bypass cookie, `/admin` shows the login card and `curl -X POST /api/trpc/game.start` returns 401.

- [ ] **Step 7: Verify** `bun run check && bun run typecheck && bun test`. Commit — `feat(admin): SSO login, quiz list and host console`.

---

### Task 13: Editor (text, rects, order, enable/disable)

**Files:**
- Create: `src/quizzes/frame-reveal/rect-math.ts` (+ `rect-math.test.ts`), `src/quizzes/frame-reveal/client/RectEditor.tsx`
- Replace: `src/quizzes/frame-reveal/client/Editor.tsx`, `src/client/admin/EditorScreen.tsx`

**Interfaces:**
- Consumes: `Rect`, `Slide`, `FrameRevealContent`, `Frame` (`boxRef`, `boxProps`), `EditorProps`, `quiz.get`/`quiz.update`.
- Produces: `type DragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"`, `MIN_RECT = 0.02`, `rectFromPoints(a, b): Rect`, `dragRect(r0, mode, dx, dy): Rect`, `<RectEditor media rects onChange />`, `<FrameRevealEditor />` (answer input `data-testid="editor-answer"`, save button `data-testid="editor-save"`).

- [ ] **Step 1: Failing test `rect-math.test.ts`**

```ts
import { expect, test } from "bun:test";
import { dragRect, MIN_RECT, rectFromPoints } from "./rect-math";

const r = { x: 0.2, y: 0.2, w: 0.3, h: 0.3 };

test("rectFromPoints normalizes reversed drags and clamps to the frame", () => {
  expect(rectFromPoints({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.4 });
  expect(rectFromPoints({ x: 0.9, y: 0.9 }, { x: 1.4, y: -0.2 })).toEqual({ x: 0.9, y: 0, w: 0.1, h: 0.9 });
});

test("move keeps size and stays inside", () => {
  expect(dragRect(r, "move", 0.1, 0.1)).toEqual({ x: 0.3, y: 0.3, w: 0.3, h: 0.3 });
  expect(dragRect(r, "move", 0.9, -0.9)).toEqual({ x: 0.7, y: 0, w: 0.3, h: 0.3 });
});

test("edges and corners resize with a minimum size", () => {
  expect(dragRect(r, "e", 0.1, 0)).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 });
  expect(dragRect(r, "w", -0.1, 0)).toEqual({ x: 0.1, y: 0.2, w: 0.4, h: 0.3 });
  expect(dragRect(r, "se", 0.1, 0.2)).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.5 });
  expect(dragRect(r, "w", 0.9, 0).w).toBeCloseTo(MIN_RECT, 6);
  expect(dragRect(r, "n", 0, -0.9).y).toBe(0);
});
```

- [ ] **Step 2: Run** — FAIL. **Implement `rect-math.ts`:**

```ts
import type { Rect } from "./schema";

export type DragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type Point = { x: number; y: number };
export const MIN_RECT = 0.02;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const tidy = (x1: number, y1: number, x2: number, y2: number): Rect => ({
  x: r4(x1),
  y: r4(y1),
  w: r4(x2 - x1),
  h: r4(y2 - y1),
});

export function rectFromPoints(a: Point, b: Point): Rect {
  const [x1, x2] = [clamp(Math.min(a.x, b.x), 0, 1), clamp(Math.max(a.x, b.x), 0, 1)];
  const [y1, y2] = [clamp(Math.min(a.y, b.y), 0, 1), clamp(Math.max(a.y, b.y), 0, 1)];
  return tidy(x1, y1, x2, y2);
}

export function dragRect(r0: Rect, mode: DragMode, dx: number, dy: number): Rect {
  if (mode === "move") {
    const x = clamp(r0.x + dx, 0, 1 - r0.w);
    const y = clamp(r0.y + dy, 0, 1 - r0.h);
    return tidy(x, y, x + r0.w, y + r0.h);
  }
  let [x1, y1, x2, y2] = [r0.x, r0.y, r0.x + r0.w, r0.y + r0.h];
  if (mode.includes("w")) x1 = clamp(x1 + dx, 0, x2 - MIN_RECT);
  if (mode.includes("e")) x2 = clamp(x2 + dx, x1 + MIN_RECT, 1);
  if (mode.includes("n")) y1 = clamp(y1 + dy, 0, y2 - MIN_RECT);
  if (mode.includes("s")) y2 = clamp(y2 + dy, y1 + MIN_RECT, 1);
  return tidy(x1, y1, x2, y2);
}
```

Run — PASS (`toEqual` on floats relies on `r4` rounding; if a case fails by 1e-4, compare with `toBeCloseTo` per field instead of changing the math).

- [ ] **Step 3: `RectEditor.tsx`**

```tsx
import { X } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { Frame } from "@/client/shared/Frame";
import { cn } from "@/lib/utils";
import type { MediaRef } from "@/shared/media";
import { type DragMode, dragRect, MIN_RECT, type Point, rectFromPoints } from "../rect-math";
import type { Rect } from "../schema";

const HANDLES: Array<{ mode: DragMode; className: string }> = [
  { mode: "n", className: "-top-1.5 inset-x-2 h-3 cursor-ns-resize" },
  { mode: "s", className: "-bottom-1.5 inset-x-2 h-3 cursor-ns-resize" },
  { mode: "e", className: "-right-1.5 inset-y-2 w-3 cursor-ew-resize" },
  { mode: "w", className: "-left-1.5 inset-y-2 w-3 cursor-ew-resize" },
  { mode: "nw", className: "-top-1.5 -left-1.5 size-3 cursor-nwse-resize rounded-sm bg-primary" },
  { mode: "se", className: "-right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm bg-primary" },
  { mode: "ne", className: "-top-1.5 -right-1.5 size-3 cursor-nesw-resize rounded-sm bg-primary" },
  { mode: "sw", className: "-bottom-1.5 -left-1.5 size-3 cursor-nesw-resize rounded-sm bg-primary" },
];

type Drag = { kind: "draw"; p0: Point } | { kind: "edit"; i: number; mode: DragMode; p0: Point; r0: Rect };
const pct = (n: number) => `${n * 100}%`;

type Props = { media: MediaRef; rects: Rect[]; onChange: (rects: Rect[]) => void };

export function RectEditor({ media, rects, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);

  const toPoint = (e: PointerEvent): Point => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return { x: 0, y: 0 };
    return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height };
  };
  const begin = (e: PointerEvent, d: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    box.current?.setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toPoint(e);
    if (d.kind === "draw") setDraft(rectFromPoints(d.p0, p));
    else onChange(rects.map((r, j) => (j === d.i ? dragRect(d.r0, d.mode, p.x - d.p0.x, p.y - d.p0.y) : r)));
  };
  const onPointerUp = () => {
    if (drag.current?.kind === "draw" && draft && draft.w >= MIN_RECT && draft.h >= MIN_RECT) {
      onChange([...rects, draft]);
    }
    drag.current = null;
    setDraft(null);
  };

  return (
    <Frame
      media={media}
      boxRef={box}
      boxProps={{
        className: "touch-none cursor-crosshair",
        onPointerDown: (e) => e.button === 0 && begin(e, { kind: "draw", p0: toPoint(e) }),
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
      }}
    >
      {rects.map((r, i) => (
        <div
          key={`${i}:${r.x}:${r.y}`}
          className="absolute cursor-move bg-black/90 outline-2 outline-dashed outline-primary"
          style={{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }}
          onPointerDown={(e) => begin(e, { kind: "edit", i, mode: "move", p0: toPoint(e), r0: r })}
        >
          {HANDLES.map((h) => (
            <div
              key={h.mode}
              className={cn("absolute z-10", h.className)}
              onPointerDown={(e) => begin(e, { kind: "edit", i, mode: h.mode, p0: toPoint(e), r0: r })}
            />
          ))}
          <button
            type="button"
            aria-label="Удалить квадрат"
            className="absolute top-1 right-1 z-20 rounded-full bg-destructive p-0.5 text-white"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange(rects.filter((_, j) => j !== i))}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {draft && (
        <div
          className="absolute bg-black/80 outline-2 outline-dashed outline-primary"
          style={{ left: pct(draft.x), top: pct(draft.y), width: pct(draft.w), height: pct(draft.h) }}
        />
      )}
    </Frame>
  );
}
```

- [ ] **Step 4: `Editor.tsx`**

```tsx
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eraser, GripVertical, Save, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MediaPicture } from "@/client/shared/MediaPicture";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { EditorProps } from "../../client-types";
import type { FrameRevealContent, Slide } from "../schema";
import { RectEditor } from "./RectEditor";

export function FrameRevealEditor({ content, saving, onSave, onDirtyChange }: EditorProps) {
  const saved = content as FrameRevealContent;
  const [draft, setDraft] = useState(saved);
  const [selectedId, setSelectedId] = useState(saved.slides[0]?.id);
  useEffect(() => setDraft(saved), [saved]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !saving) void onSave(draft);
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => dirty && e.preventDefault();
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  });

  const patch = (id: string, p: Partial<Slide>) =>
    setDraft((d) => ({ slides: d.slides.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const from = d.slides.findIndex((s) => s.id === active.id);
      const to = d.slides.findIndex((s) => s.id === over.id);
      return { slides: arrayMove(d.slides, from, to) };
    });
  };

  const selected = draft.slides.find((s) => s.id === selectedId);
  const enabledCount = draft.slides.filter((s) => s.enabled).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
            <Undo2 /> Отменить
          </Button>
          <Button data-testid="editor-save" disabled={!dirty || saving} onClick={() => onSave(draft)}>
            <Save /> Сохранить <kbd className="ml-1 text-xs opacity-60">⌘S</kbd>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="gap-0 py-0">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Кадры · включено {enabledCount} из {draft.slides.length}
            </CardTitle>
          </CardHeader>
          <ScrollArea className="h-[70vh]">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={draft.slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-1 p-2">
                  {draft.slides.map((s, i) => (
                    <SlideRow
                      key={s.id}
                      slide={s}
                      number={i + 1}
                      active={s.id === selectedId}
                      onSelect={() => setSelectedId(s.id)}
                      onToggle={(enabled) => patch(s.id, { enabled })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </ScrollArea>
        </Card>
        {selected && (
          <Card className="gap-0 py-0">
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="h-[55vh]">
                <RectEditor media={selected.media} rects={selected.rects} onChange={(rects) => patch(selected.id, { rects })} />
              </div>
              <p className="text-xs text-muted-foreground">
                Тяни по картинке, чтобы нарисовать квадрат. Квадрат можно перетаскивать и тянуть за грани и углы.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="answer">Ответ</Label>
                  <Input id="answer" data-testid="editor-answer" value={selected.answer} onChange={(e) => patch(selected.id, { answer: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="hint">Что закрыто (подсказка ведущему)</Label>
                  <Input id="hint" value={selected.hint} onChange={(e) => patch(selected.id, { hint: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Квадратов: {selected.rects.length}
                <Button variant="ghost" size="sm" disabled={!selected.rects.length} onClick={() => patch(selected.id, { rects: [] })}>
                  <Eraser /> Стереть все
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

type RowProps = {
  slide: Slide;
  number: number;
  active: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
};

function SlideRow({ slide, number, active, onSelect, onToggle }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border p-1.5 pr-3",
        active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted",
        isDragging && "z-10 shadow-lg",
        !slide.enabled && "opacity-50",
      )}
    >
      <button type="button" aria-label="Перетащить" className="cursor-grab text-muted-foreground" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <MediaPicture media={slide.media} sizes="96px" className="aspect-video w-20 shrink-0 rounded object-cover" />
        <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">{number}</span>
        <span className="truncate text-sm">{slide.answer}</span>
      </button>
      <Switch checked={slide.enabled} onCheckedChange={onToggle} aria-label="Показывать кадр" />
    </div>
  );
}
```

- [ ] **Step 5: Full `EditorScreen.tsx`**

```tsx
import { ArrowLeft } from "lucide-react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/client/shared/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminModule } from "@/quizzes/registry.admin";

export function EditorScreen({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const quiz = trpc.quiz.get.useQuery({ quizId });
  const update = trpc.quiz.update.useMutation();
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);
  const close = () => {
    if (!dirty.current || window.confirm("Есть несохранённые изменения. Выйти без сохранения?")) onClose();
  };
  const onSave = async (content: unknown) => {
    try {
      await update.mutateAsync({ quizId, content });
      await Promise.all([utils.quiz.get.invalidate({ quizId }), utils.quiz.list.invalidate()]);
      toast.success("Сохранено — гости уже видят изменения");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  if (quiz.isPending) return <Skeleton className="mx-auto h-[70vh] max-w-7xl" />;
  if (quiz.error) return <p className="text-destructive">{quiz.error.message}</p>;
  const m = getAdminModule(quiz.data.type);
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={close}><ArrowLeft /> Назад</Button>
        <h2 className="text-lg font-semibold">{quiz.data.title}</h2>
      </div>
      {m ? (
        <m.Editor content={quiz.data.content} saving={update.isPending} onSave={onSave} onDirtyChange={onDirtyChange} />
      ) : (
        <p>Неизвестный тип викторины</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Manual check** — dev server + bypass: open the editor, drag a rect edge, rename an answer, toggle a slide off, drag a slide to another position, press ⌘S → toast; with a guest window showing that slide, the cover moves immediately; disabled slide disappears from the console strip; "Назад" with unsaved changes asks for confirmation.

- [ ] **Step 7: Verify** `bun test && bun run check && bun run typecheck`. Commit — `feat(admin): frame editor with rects, order and visibility`.

---

### Task 14: End-to-end sync check

**Files:**
- Create: `e2e/sync.e2e.ts`

**Interfaces:**
- Consumes: test ids `lobby`, `start-frames`, `slide-counter`, `host-answer`, `answer`, `cover`, `frame-box`; `/api/dev/host-login`.

- [ ] **Step 1: Write `e2e/sync.e2e.ts`**

```ts
/** Manual browser e2e: bun run e2e (needs Google Chrome; override with CHROME_PATH). */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const PORT = 3999;
const base = `http://localhost:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "party-quiz-e2e-"));

function startServer() {
  return Bun.spawn(["bun", "src/server/index.ts"], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_DEV_BYPASS: "1", NODE_ENV: "development" },
    stdout: "inherit",
    stderr: "inherit",
  });
}
async function waitHealthy() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("server did not start");
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`E2E: ${msg}`);
}
const counter = (p: Page) => p.$eval('[data-testid="slide-counter"]', (e) => e.textContent?.trim() ?? "");
const waitCounter = (p: Page, prefix: string) =>
  p.waitForFunction(
    (pre) => document.querySelector('[data-testid="slide-counter"]')?.textContent?.trim().startsWith(pre),
    { timeout: 15000 },
    prefix,
  );

let server = startServer();
await waitHealthy();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const host = await browser.newPage();
  await host.setViewport({ width: 1400, height: 900 });
  await host.goto(`${base}/api/dev/host-login`);

  const tv = await browser.newPage();
  await tv.setViewport({ width: 1920, height: 1080 });
  const phone = await browser.newPage();
  await phone.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 });
  const guests = [tv, phone];
  for (const g of guests) {
    await g.goto(base);
    await g.waitForSelector('[data-testid="lobby"]');
  }

  await host.waitForSelector('[data-testid="start-frames"]');
  await host.click('[data-testid="start-frames"]');
  for (const g of guests) await waitCounter(g, "1 /");
  const answer = await host.$eval('[data-testid="host-answer"]', (e) => e.textContent?.trim() ?? "");
  assert(answer.length > 0, "host sees the answer");
  for (const g of guests) assert(!(await g.content()).includes(answer), "answer leaked before reveal");

  for (const g of guests) {
    await g.waitForSelector('[data-testid="cover"]');
    const inside = await g.evaluate(() => {
      const box = document.querySelector('[data-testid="frame-box"]')?.getBoundingClientRect();
      if (!box) return false;
      return [...document.querySelectorAll('[data-testid="cover"]')].every((c) => {
        const r = c.getBoundingClientRect();
        return r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      });
    });
    assert(inside, "covers lie inside the image box");
  }

  await host.keyboard.press("Space");
  for (const g of guests) {
    await g.waitForFunction(
      (a) => document.querySelector('[data-testid="answer"]')?.textContent?.includes(a),
      { timeout: 5000 },
      answer,
    );
  }

  const late = await browser.newPage();
  await late.goto(base);
  await late.waitForSelector('[data-testid="answer"]');
  assert((await late.$$('[data-testid="cover"]')).length === 0, "late guest must not see covers");

  await tv.screenshot({ path: "/tmp/party-quiz-tv.png" });
  await phone.screenshot({ path: "/tmp/party-quiz-phone.png" });

  // Restart the server: guests reconnect and resume from persisted state.
  server.kill();
  await server.exited;
  server = startServer();
  await waitHealthy();
  await host.reload();
  await host.waitForSelector('[data-testid="host-answer"]');
  await host.keyboard.press("ArrowRight");
  for (const g of guests) await waitCounter(g, "2 /");
  console.log(`E2E OK (tv: ${await counter(tv)}, phone: ${await counter(phone)})`);
} finally {
  await browser.close();
  server.kill();
}
```

- [ ] **Step 2: Run** `bun run e2e` — Expected: `E2E OK (...)`. Look at `/tmp/party-quiz-tv.png` and `/tmp/party-quiz-phone.png` (Read them) — frame centered, answer plaque visible, nothing overflowing. Fix any UI defects found, re-run.

- [ ] **Step 3: Verify** `bun run check && bun run typecheck`. Commit — `test: browser e2e for host/guest sync, late join and reconnect`.

---

### Task 15: Docker image, compose, CI workflow and README

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `README.md`

- [ ] **Step 1: `Dockerfile`**

```dockerfile
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml tsconfig.json ./
COPY styles ./styles
COPY drizzle ./drizzle
COPY content ./content
COPY public ./public
COPY src ./src
RUN mkdir -p /data && chown -R bun:bun /data
USER bun
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["bun", "src/server/index.ts"]
```

`.dockerignore`:
```
node_modules
data
.git
.github
docs
e2e
scripts
*.md
.env*
```

- [ ] **Step 2: `docker-compose.yml` and `.env.example`**

```yaml
services:
  party-quiz:
    image: ghcr.io/brofrong/party-quiz:latest
    container_name: party-quiz
    restart: unless-stopped
    ports:
      - "${PARTY_QUIZ_PORT:-3000}:3000"
    environment:
      BETTER_AUTH_URL: ${BETTER_AUTH_URL:?Публичный адрес сайта, например https://quiz.brofrong.ru}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?Сгенерируй: openssl rand -base64 32}
      OIDC_ISSUER: ${OIDC_ISSUER:-https://sso.brofrong.ru}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:?Client ID из SSO}
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:?Client secret из SSO}
    volumes:
      - party-quiz-data:/data

volumes:
  party-quiz-data:
```

```dotenv
# .env.example — скопируй в .env (для compose / Arcane)
BETTER_AUTH_URL=https://quiz.brofrong.ru
BETTER_AUTH_SECRET=
OIDC_ISSUER=https://sso.brofrong.ru
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
PARTY_QUIZ_PORT=3000
```

- [ ] **Step 3: `.github/workflows/ci.yml`**

```yaml
name: CI & Docker

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:

permissions:
  contents: read
  packages: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx biome ci .
      - run: bun run typecheck
      - run: bun test

  docker:
    needs: check
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 4: `README.md`** (Russian) — sections: what it is (one paragraph); quick start (`bun install`, `AUTH_DEV_BYPASS=1 bun run dev`, open `/` and `/admin` → "Dev-вход"); scripts table; deployment (compose/Arcane, env table from `.env.example`, data volume `/data`); SSO client setup (type: confidential, redirect URIs `https://<домен>/api/auth/callback/sso` and `http://localhost:3000/api/auth/callback/sso`, scopes `openid profile email`, PKCE on); reverse proxy notes (WebSocket upgrade on `/api/trpc`, NPM "Websockets Support" toggle; no response buffering needed); adding frames (`bun run media:import ...`, commit `public/media` + `content/quizzes`, `bun run seed:reset frames` to overwrite DB content — warns it replaces edits made in the admin); adding a new quiz type (server module + `registry.server.ts`, client components + `registry.player.ts` / `registry.admin.ts`, seed json in `content/quizzes/`).

- [ ] **Step 5: Docker smoke test**

```bash
docker build -t party-quiz:local .
docker run -d --name pq-smoke -p 3100:3000 \
  -e BETTER_AUTH_URL=http://localhost:3100 -e BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  -e OIDC_CLIENT_ID=dummy -e OIDC_CLIENT_SECRET=dummy party-quiz:local
for i in $(seq 1 30); do curl -sf localhost:3100/api/health && break; sleep 1; done; echo
html=$(curl -s localhost:3100/); echo "$html" | grep -o '<script[^>]*src="[^"]*"' | head -2
css=$(echo "$html" | grep -o 'href="[^"]*\.css"' | head -1 | sed 's/href="//;s/"//')
curl -s "localhost:3100$css" | grep -c "party-bg\|\.bg-black"   # expected: >= 1 (Tailwind compiled)
curl -sI "localhost:3100/media/$(ls public/media | head -1)" | grep -i cache-control
docker inspect --format '{{.State.Health.Status}}' pq-smoke    # after ~30s: healthy
docker images party-quiz:local --format '{{.Size}}'
docker rm -f pq-smoke
```

Expected: health `{"ok":true}`, script tags present, CSS contains compiled utilities, media immutable, container healthy. If Bun's production HTML bundling does not apply the Tailwind plugin at runtime, switch to an explicit build step: `Bun.build({ entrypoints: ["src/server/index.ts"], target: "bun", outdir: "dist", plugins: [tailwind], minify: true })` in a `build` stage and run `bun dist/index.js` — then repeat this smoke test.

- [ ] **Step 6: Verify** `bun run check && bun run typecheck && bun test`. Commit — `build: docker image, compose for Arcane, CI workflow and README`.

---

### Task 16: Publish to GitHub and verify the pipeline

- [ ] **Step 1: Create the public repo and push**

```bash
gh repo create brofrong/party-quiz --public --source . --remote origin --push \
  --description "Realtime party quiz: host console + synced guest screens (Bun, React, tRPC)"
```

- [ ] **Step 2: Watch the workflow** — `gh run watch --exit-status $(gh run list --limit 1 --json databaseId -q '.[0].databaseId')`. Expected: `check` and `docker` succeed. On failure: read `gh run view --log-failed`, fix, commit, push, repeat.

- [ ] **Step 3: Check the package** — `gh api /users/brofrong/packages/container/party-quiz --jq '.visibility'`. If `private`, tell the user to make it public in GitHub → Packages → party-quiz → Package settings → Change visibility (the API cannot change it), or to add ghcr.io credentials in Arcane.

- [ ] **Step 4: Pull test** — `docker pull ghcr.io/brofrong/party-quiz:latest` (works without login once public).
