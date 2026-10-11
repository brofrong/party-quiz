# «Что ответит Аня?» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вторая викторина: именинница отвечает в консоли ведущего, гости голосуют с телефонов из 4 вариантов, ведётся счёт.

**Architecture:** Общий механизм модулей получает персональный публичный вид (`publicView(content, state, viewer)`) и необязательные гостевые действия (`playerActionSchema` + `reducePlayer`), движок — `playerDispatch`, роутер — `game.act` и `profile.setName`. Новый модуль `birthday-guess` (чистая логика + клиентские Player/HostConsole/Editor) регистрируется рядом с `frame-reveal`, сид — `content/quizzes/birthday.json`.

**Tech Stack:** Bun, TypeScript, zod 4, tRPC 11, React 19, Tailwind 4, shadcn/ui, motion, @dnd-kit, bun:test, puppeteer-core (e2e).

**Spec:** `docs/superpowers/specs/2026-10-11-birthday-guess-design.md`

## Global Constraints

- `frame-reveal` поведение и тесты не меняются (кроме сигнатуры `publicView` с лишним игнорируемым аргументом).
- Ложных вариантов у вопроса ровно 4; в игру идут ответ Ани + первые 3 неисключённых.
- До `revealed` публичный вид не содержит ответа Ани, `correct`, ложных вариантов, чужих голосов и распределения; до `voting` — текста вопроса.
- Имя гостя: 1–24 символа после trim; имя по умолчанию анонимной сессии (`Anonymous`) = «не представился».
- Всё UI на русском; `biome ci`, `tsc --noEmit`, `bun test` зелёные перед каждым коммитом.

## Review Focus

- Двойной клик ведущего («Показать гостям», «Открыть ответ») — no-op, варианты не перемешиваются заново (тест в Task 2).
- Гость голосует, пока фаза уже `revealed` (гонка) — `BAD_REQUEST`, очки не меняются (Task 2).
- Ответ Ани совпал сразу с двумя ложными вариантами — остаётся 2, `startVoting` невозможен, кнопка неактивна (Task 2 + Task 6).
- WS-подписка держит контекст с момента подключения, поэтому имя в виде берётся из `state.players`, а не из `viewer.name` (Task 2: вид использует `players`).
- Правка вопроса во время голосования не меняет показанные варианты (Task 2).

---

### Task 1: Движок — персональный вид, гостевые действия, имя гостя

**Files:**
- Modify: `src/quizzes/types.ts`, `src/server/engine.ts`, `src/server/trpc/{router,context}.ts`, `src/server/app.ts`, `src/quizzes/frame-reveal/logic.ts` (сигнатура), `src/shared/game.ts`
- Create: `src/shared/player-name.ts`
- Test: `src/server/engine.test.ts`, `src/server/trpc/router.test.ts`

**Interfaces — Produces:**
- `type Viewer = { id: string; name: string }` (в `src/quizzes/types.ts`)
- `QuizModule.publicView(content, state, viewer: Viewer | null)`; optional `playerActionSchema`, `reducePlayer(content, state, player: Viewer, action)`
- `GameEngine.playerSnapshot(viewer?: Viewer | null)`, `GameEngine.playerDispatch(viewer: Viewer, action: unknown)` (нет `reducePlayer` → `EngineError("Здесь нельзя отвечать")`)
- tRPC `game.act({ action })` (guest), `profile.setName({ name })` (guest) → `ctx.renameUser(id, name)`; `Context.renameUser: (id: string, name: string) => void` (в app.ts — `UPDATE user SET name=?, updatedAt=? WHERE id=?`)
- `src/shared/player-name.ts`: `PLAYER_NAME_MAX = 24`, `playerNameSchema`, `hasPlayerName(user: { name: string; isAnonymous: boolean } | null): boolean`

- [ ] Тесты движка: модуль-заглушка с `reducePlayer` получает `viewer`; `playerDispatch` у `frame-reveal` → `EngineError`; `playerSnapshot(viewer)` передаёт `viewer` в `publicView`.
- [ ] Тесты роутера: `game.act` без игры → `BAD_REQUEST`; `profile.setName` вызывает `renameUser`, пустое/длинное имя → `BAD_REQUEST`; `me` отдаёт `hasName`.
- [ ] Реализация, прогон `bun test`, коммит.

### Task 2: Логика `birthday-guess` (TDD)

**Files:**
- Create: `src/quizzes/birthday-guess/{schema,logic,module}.ts`, `src/quizzes/birthday-guess/logic.test.ts`, `src/test/birthday-fixtures.ts`

**Interfaces — Produces (schema.ts):**
- `BirthdayContent = { questions: Question[] }`, `Question = { id, text, decoys: [4 strings], enabled }`
- `BirthdayState = { index, questionId, showScores, players: Record<string,string>, rounds: Record<string, Round> }`
- `Round = { phase: "answering"|"checking"|"voting"|"revealed", answer: string|null, excluded: number[], options: string[]|null, correct: number|null, votes: Record<string, number> }`
- Host actions: `next | prev | goto{index} | submitAnswer{text} | toggleDecoy{index} | editAnswer | startVoting | reveal | reopen | toggleScores`
- Player action: `vote{option: 0..3}`
- `BirthdayPublicView = { index, total, stage: "empty"|"answering"|"voting"|"revealed"|"final", question: string|null, options: OptionView[]|null, votedCount, myVote: number|null, myResult: "correct"|"wrong"|"none"|null, me: {name, score}|null, showScores, leaderboard: LeaderRow[]|null }`, `OptionView = { text, count: number|null, names: string[]|null, correct: boolean|null }`, `LeaderRow = { name, score, place }`
- `BirthdayHostView = BirthdayPublicView & { current: {question: Question; round: Round} | null, liveVotes: Array<{text; names: string[]}> | null, questions: Array<{id; text; phase}>, fullLeaderboard: LeaderRow[] }`
- logic.ts: `normalizeAnswer(s)`, `initialState`, `reduce`, `reducePlayer`, `publicView`, `hostView`, `leaderboard(state)`

- [ ] Тесты: фазы и no-op; автопометка (регистр/ё/пунктуация); `startVoting` берёт запасной вариант и требует ≥3; повторный `startVoting`/`reveal` — no-op; голос/смена голоса/голос вне `voting` бросает; голос без имени бросает; очки и порядок таблицы (равные очки — одно место); публичный вид без секретов до открытия; правка текста вопроса во время голосования не меняет `options`; удалённый текущий вопрос → встаёт следующий в `answering`; финал при `index == total`; пустая викторина.
- [ ] Реализация, `bun test`, коммит.

### Task 3: Регистрация и сид

**Files:** `src/quizzes/registry.server.ts`, `src/quizzes/registry.server.test.ts`, `content/quizzes/birthday.json`

- [ ] Тест: `getQuizModule("birthday-guess")` работает через стёртый интерфейс, сид валиден (`loadSeedFiles("content/quizzes")`).
- [ ] 15 вопросов × 4 правдоподобных ложных варианта, id `q1..q15`.
- [ ] Коммит.

### Task 4: Клиентская обвязка

**Files:** `src/quizzes/client-types.ts` (`Player: ComponentType<{ view: unknown; act?: (a: unknown) => void }>`), `src/client/player/App.tsx`, `src/client/shared/NamePrompt.tsx`, `src/client/shared/use-player-name.ts`, `src/components/ui/dialog.tsx` (shadcn), `src/quizzes/registry.{player,admin}.ts`

- [ ] `PlayerRoot` создаёт `act` через `trpc.game.act` (toast при ошибке).
- [ ] `usePlayerName()` → `{ name, hasName, setName(name): Promise<void> }` на `trpc.me` + `profile.setName`.
- [ ] `NamePrompt` — диалог с полем имени, `data-testid="name-input"` / `name-save`.

### Task 5: Player

**Files:** `src/quizzes/birthday-guess/client/{Player,Leaderboard}.tsx`, `player-module.ts`

- Стадии `answering` («Аня отвечает…», `data-testid="bg-waiting"`), `voting` (кнопки `data-testid="bg-option-{i}"`), `revealed` (`bg-result` с текстом «Угадал! +1» / «Мимо» / «Ты не голосовал»), `final`/`showScores` (`bg-leaderboard`), плашка имени `bg-me`.

### Task 6: HostConsole

**Files:** `src/quizzes/birthday-guess/client/HostConsole.tsx`, `admin-module.ts`

- `answering`: поле `bg-answer-input`, «Готово» `bg-answer-submit`; `checking`: ложные варианты с переключателями `bg-decoy-{i}`, «Показать гостям» `bg-start-voting`; `voting`: живые голоса, «Открыть ответ» `bg-reveal`; навигация, «Таблица» `bg-scores`, предпросмотр `Player`.

### Task 7: Editor

**Files:** `src/quizzes/birthday-guess/client/Editor.tsx`

- Список с @dnd-kit, «Добавить вопрос», удаление, Switch, поля текста и 4 вариантов, сохранение ⌘S, предупреждение о несохранённом.

### Task 8: e2e, README, деплой

**Files:** `e2e/sync.e2e.ts`, `README.md`

- [ ] Сценарий: ведущий запускает `birthday`, вводит ответ, показывает гостям; два телефона представляются и голосуют (один верно); после открытия у них «Угадал! +1» / «Мимо», таблица 1/0; рестарт сервера — очки на месте.
- [ ] README: раздел про викторину. Push, CI зелёный.
