# Party Quiz — дизайн

Дата: 2026-10-10

## Цель

Веб-приложение для вечеринки (день рождения): ведущий управляет викториной со своего
устройства, гости и телевизор синхронно видят текущий экран на своих устройствах.
Первая викторина — «Угадай кадр»: кадр из фильма/мультика/мема с чёрным квадратом,
который по команде ведущего эффектно исчезает. Архитектура должна позволять добавлять
новые типы викторин отдельными модулями, включая будущие интерактивные (гости
что-то нажимают/отвечают).

## Критерии успеха

- Гость сканирует QR с телевизора и через пару секунд видит лобби; при старте игры все
  экраны переключаются без перезагрузки.
- Переключение кадра ведущим доходит до всех экранов практически мгновенно (< 300 мс в
  локальной сети / нормальном интернете).
- Следующие кадры уже загружены к моменту переключения; вес кадра ~80–150 КБ.
- Гость не может получить ответ до того, как ведущий откроет кадр (ответ не уходит
  в гостевые данные; оригинал картинки при этом доступен — осознанный компромисс).
- После сна телефона / смены сети гость автоматически возвращается на текущий кадр.
- Ведущий может править ответ, подсказку, квадраты и порядок кадров прямо на сервере.
- Образ собирается GitHub Action'ом и запускается через docker compose (Arcane).

## Не входит (YAGNI)

- Вторая викторина («Именинница всегда права») — только архитектурная готовность.
- Загрузка новых картинок и создание викторин через UI (контент добавляется через репозиторий).
- Ввод имён гостей, очки, ответы гостей.
- Несколько параллельных игровых сессий (одна глобальная сессия).

## Стек

- Рантайм, сервер, бандлер, пакетный менеджер, тесты: **Bun** (`Bun.serve` + HTML imports).
- Фронтенд: **React 19**, **Tailwind CSS v4**, **shadcn/ui**, **motion** (анимации),
  **@dnd-kit** (сортировка), **qrcode** (генерация QR).
- API: **tRPC v11**, подписки по **WebSocket** через `trpc-bun-adapter`; на клиенте
  `@tanstack/react-query` + `splitLink` (запросы/мутации по HTTP, подписки по WS).
- Авторизация: **Better Auth** — плагины `genericOAuth` (OIDC `sso.brofrong.ru`) и `anonymous`.
- База: **SQLite** через `bun:sqlite` + **Drizzle ORM** (+ drizzle-kit для миграций).
- Валидация: **zod**.
- Линт/формат: **Biome**.
- Обработка картинок (только dev-скрипт): **sharp**.

## Архитектура

```
Браузер гостя/ТВ (/)        Браузер ведущего (/admin)
   │  WS: game.onState         │  HTTP: game.dispatch, quiz.update…
   │                            │  WS: game.onState (host view)
   ▼                            ▼
┌──────────────────────── Bun.serve ────────────────────────┐
│  "/"        → src/client/player/index.html (bundle)        │
│  "/admin/*" → src/client/admin/index.html  (bundle)        │
│  "/api/auth/*"  → Better Auth handler                      │
│  "/api/trpc/*"  → tRPC fetch handler (HTTP)                │
│  "/api/trpc-ws" → tRPC WebSocket (trpc-bun-adapter)        │
│  "/media/*"     → статика, Cache-Control: immutable        │
│                                                            │
│  GameEngine (in-memory + persist) ── SQLite (/data/app.db) │
│  Quiz registry: { "frame-reveal": frameRevealModule, … }   │
└────────────────────────────────────────────────────────────┘
```

### Модули верхнего уровня

- `src/server/index.ts` — точка входа: `Bun.serve`, маршруты, WS.
- `src/server/auth.ts` — конфигурация Better Auth; helper `getSession(headers)`.
- `src/server/db/` — Drizzle-схема, подключение, миграции, сид контента.
- `src/server/engine.ts` — **GameEngine**: единственный источник истины об активной игре.
- `src/server/trpc/` — инициализация tRPC, контекст, процедуры (`publicProcedure`,
  `guestProcedure`, `hostProcedure`), роутеры.
- `src/quizzes/` — модули викторин и реестр.
- `src/client/player/` — приложение гостя/ТВ.
- `src/client/admin/` — приложение ведущего.
- `src/client/shared/` — tRPC-клиент, shadcn-компоненты, общие компоненты (рендер кадра,
  анимации, QR).
- `scripts/media-import.ts` — импорт и сжатие картинок, генерация сид-контента.

### Модуль викторины (контракт)

```ts
interface QuizModule<Content, State, Action, PublicView, HostView> {
  type: string;                       // "frame-reveal"
  title: string;                      // человекочитаемое имя типа
  contentSchema: z.ZodType<Content>;
  actionSchema: z.ZodType<Action>;
  initialState(content: Content): State;
  reduce(content: Content, state: State, action: Action): State; // чистая функция
  publicView(content: Content, state: State): PublicView;        // без секретов
  hostView(content: Content, state: State): HostView;            // всё для пульта
  // клиентская часть регистрируется отдельно (чтобы сервер не тянул React):
}
interface QuizClientModule {
  type: string;
  Player: React.FC<{ view: PublicView }>;
  HostConsole: React.FC<{ quizId: string; view: HostView; dispatch(a: Action): void }>;
  Editor: React.FC<{ quizId: string; content: Content }>;
}
```

Серверный реестр — `src/quizzes/registry.server.ts`, клиентский —
`src/quizzes/registry.client.tsx`. Новый тип = новая папка + по строке в каждом реестре.
Будущие действия гостей: добавить в контракт опциональные `guestActionSchema` и
`reduceGuest(content, state, action, guestId)` — ядро и транспорт уже знают личность гостя.

### GameEngine

Состояние сессии:

```ts
type Session =
  | { status: "lobby" }
  | { status: "playing"; quizId: string; quizType: string; state: unknown; rev: number };
```

- Хранит `Session` в памяти, загружает из таблицы `game_session` при старте, сохраняет
  при каждом изменении (запись одной строки).
- Методы: `start(quizId)`, `stop()` (→ лобби), `dispatch(action)` (валидирует через
  `actionSchema`, вызывает `reduce`), `reset()` (→ `initialState`), `contentChanged(quizId)`
  (после правок в редакторе; пересчитывает представления и рассылает).
- Рассылка: `EventEmitter`; подписка `game.onState` для гостя отдаёт
  `{ status, quizType, view: publicView, rev, online }`, для ведущего — `hostView`.
- Присутствие: счётчик уникальных `guestId`/`userId` среди открытых WS-подписок
  `game.onState` (без ведущих), рассылается при изменении.
- Если контент изменился так, что индекс вышел за пределы, `reduce`/`publicView` модуля
  клампят индекс.

### tRPC API

Контекст: сессия Better Auth из заголовков (HTTP) или из upgrade-запроса (WS).

- `publicProcedure` — без сессии.
- `guestProcedure` — любая сессия (анонимная или SSO).
- `hostProcedure` — сессия SSO (не anonymous); иначе `UNAUTHORIZED`.

Роутеры:

- `game.onState` (subscription, guest) — сразу отдаёт текущий снимок, потом каждое изменение.
- `game.onHostState` (subscription, host) — то же с `hostView`.
- `game.start({ quizId })`, `game.stop()`, `game.reset()`, `game.dispatch({ action })` (host).
- `quiz.list()` (host) — викторины с типом, названием, количеством элементов.
- `quiz.get({ quizId })` (host) — полный контент для редактора.
- `quiz.update({ quizId, content })` (host) — валидирует `contentSchema`, сохраняет,
  вызывает `engine.contentChanged`.

### Авторизация

- Better Auth, база — та же SQLite (drizzle adapter).
- `genericOAuth` с `providerId: "sso"`, `discoveryUrl: ${OIDC_ISSUER}/.well-known/openid-configuration`,
  `scopes: ["openid","profile","email"]`, PKCE. Callback: `/api/auth/oauth2/callback/sso`.
- `anonymous`: гостевая страница при загрузке вызывает `signIn.anonymous()`, если сессии нет.
  Если позже тот же браузер входит через SSO — анонимный пользователь удаляется (поведение плагина).
- Ведущий = любой пользователь, вошедший через SSO.
- `/admin` без SSO-сессии показывает экран «Войти через SSO».

### Данные (SQLite, Drizzle)

- Таблицы Better Auth (`user`, `session`, `account`, `verification`) + поле `isAnonymous`.
- `quiz` — `id` (text, slug), `type`, `title`, `content` (JSON text), `updatedAt`.
- `game_session` — одна строка `id = 1`, `data` (JSON `Session`), `updatedAt`.
- Миграции drizzle-kit, применяются при старте сервера.
- Сид: при старте, если `quiz` с данным id отсутствует, вставляется из
  `content/quizzes/<id>.json`. Существующие записи не перезаписываются (правки
  ведущего живут в базе). Скрипт `bun run seed:reset <id>` — принудительно перезалить.

## Викторина «Угадай кадр» (`frame-reveal`)

### Контент

```ts
type FrameRevealContent = {
  slides: Array<{
    id: string;                // стабильный id
    media: MediaRef;           // см. «Картинки»
    answer: string;            // «Иван Васильевич меняет профессию»
    hint: string;              // «Ивана Грозного» (что закрыто)
    rects: Array<{ x: number; y: number; w: number; h: number }>; // доли 0..1
    enabled: boolean;
  }>;
};
```

Порядок = порядок массива.

### Состояние и действия

```ts
type FrameRevealState = { index: number; phase: "hidden" | "revealed"; animation: RevealAnimation };
type FrameRevealAction =
  | { type: "next" } | { type: "prev" } | { type: "goto"; index: number }
  | { type: "reveal"; animation: RevealAnimation | "random" }
  | { type: "hide" };
type RevealAnimation = "dissolve" | "pixels" | "curtain" | "collapse" | "flyaway" | "shatter";
```

- Индекс — по включённым кадрам. `next`/`prev`/`goto` ставят `phase = "hidden"`.
- `random` разрешается в конкретную анимацию в `reduce` (чтобы все клиенты играли одну).

### Представления

- `publicView`: `{ index, total, slide: { id, media, rects }, phase, animation,
  answer (только если phase = "revealed"), preload: MediaRef[] (следующие 2 кадра) }`.
  Никаких `answer`/`hint` других кадров.
- `hostView`: всё из `publicView` + `slides` (id, media, answer, hint, enabled) для ленты,
  текущие `answer` и `hint`.

### Экраны

- **Player (гость/ТВ)**: кадр по центру на тёмном фоне (object-fit: contain), квадраты —
  абсолютно позиционированные слои поверх картинки в процентах. Снизу индикатор «5 / 34».
  После открытия — анимация исчезновения квадратов и плашка с ответом.
  Смена кадра — плавный кроссфейд. Wake Lock на время игры; кнопка полноэкранного режима.
- **HostConsole**: две колонки — слева `Player`-рендер (тот же компонент, что у гостей),
  справа оригинал + ответ крупно + подсказка. Панель: ←, →, «Открыть» (пробел),
  выбор анимации (+ «случайная»), «Закрыть обратно». Лента миниатюр с номерами.
  Шапка: название, статус, онлайн, «В лобби», «Сначала».
- **Editor**: список кадров с drag-and-drop (dnd-kit), переключатель «включён»;
  выбранный кадр — поля «Ответ», «Подсказка», редактор квадратов (рисование, перенос,
  ресайз за грани/углы, удаление). Сохранение — кнопкой и по Cmd+S; после сохранения
  изменения сразу видны гостям.

### Анимации исчезновения (motion)

| id | Название | Эффект |
|----|----------|--------|
| dissolve | Растворение | opacity → 0 + blur, ~700 мс |
| pixels | Пиксели | квадрат делится на сетку ~8×8, ячейки исчезают в случайном порядке |
| curtain | Шторка | две половинки разъезжаются в стороны |
| collapse | Схлопывание | scale → 0 с поворотом |
| flyaway | Улёт | улетает вверх-вбок за пределы кадра |
| shatter | Разбитое стекло | 8–12 треугольных осколков (clip-path) падают с вращением |

Случайные параметры (порядок пикселей, осколки) детерминированы от `slide.id`, чтобы на
всех экранах анимация выглядела одинаково. Учитывается `prefers-reduced-motion` (→ dissolve).

## Лобби

- Если `status = "lobby"` — экран с большим QR (ссылка = `window.location.origin`),
  крупным адресом текстом, «Ждём начала…», счётчиком подключённых. Анимированный
  градиентный фон.
- На телефонах тот же экран (QR уменьшен) — чтобы гость мог показать соседу.

## Картинки

- Исходники: отобранные кадры + `.json` с квадратами в пикселях (текущий формат папки
  `викторина/`), плюс названия/подсказки из `fetch.py`.
- `scripts/media-import.ts` (sharp):
  - для каждого кадра создаёт `public/media/<hash>-1280.avif|webp` и `<hash>-1920.avif|webp`
    (AVIF q≈55, WebP q≈75), `hash` — от содержимого исходника;
  - переводит квадраты в доли; генерирует `content/quizzes/frames.json`.
- `MediaRef = { hash: string; width: number; height: number }` (пропорции нужны, чтобы
  резервировать место до загрузки).
- Рендер: `<picture>` с `<source type="image/avif" srcset="…1280 1280w, …1920 1920w">`,
  затем WebP, `sizes="100vw"`.
- Сервер отдаёт `/media/*` с `Cache-Control: public, max-age=31536000, immutable`.
- Предзагрузка: клиент для каждого `preload` создаёт `new Image()` с тем же `srcset/sizes`
  (браузер выберет тот же файл и положит в кэш). Пульт дополнительно предзагружает соседние
  кадры ленты.
- Готовые медиа и `content/quizzes/frames.json` коммитятся в репозиторий.

## Ошибки и устойчивость

- WS-клиент tRPC переподключается автоматически (`retryDelayMs` с экспонентой до 5 с);
  при подписке сервер сразу отдаёт актуальный снимок — клиент всегда догоняет состояние.
- Индикатор «Нет связи, переподключаемся…» на всех экранах при обрыве.
- Невалидные действия/контент → `BAD_REQUEST` с текстом из zod, тост в админке.
- Падение записи в базу логируется; состояние в памяти остаётся (игра не встаёт).
- Если активная викторина удалена из базы — движок переходит в лобби.

## Деплой

- Репозиторий: `github.com/brofrong/party-quiz` (публичный).
- `Dockerfile`: стадия `deps` (`bun install --frozen-lockfile`), стадия `build`
  (`bun build --target=bun --production src/server/index.ts --outdir dist` — Bun
  full-stack сборка: сервер вместе с HTML-точками и их бандлами, Tailwind через
  `bun-plugin-tailwind`), финальная стадия `oven/bun:1-alpine` с `dist/`, `public/media`,
  `content/`, миграциями (без `node_modules`, если сборка самодостаточна; иначе только
  production-зависимости). `NODE_ENV=production`, порт `3000`, volume `/data`.
  Запуск от непривилегированного пользователя. `HEALTHCHECK` на `/api/health`.
- `.github/workflows/docker.yml`: на push в `main` и теги `v*` — Biome check, `bun test`,
  затем `docker/build-push-action` (QEMU + buildx, `linux/amd64,linux/arm64`) в
  `ghcr.io/brofrong/party-quiz` с тегами `latest`, `sha-<short>`, semver.
- `docker-compose.yml`:
  ```yaml
  services:
    party-quiz:
      image: ghcr.io/brofrong/party-quiz:latest
      restart: unless-stopped
      ports: ["3000:3000"]
      environment:
        BETTER_AUTH_URL: https://quiz.example.com
        BETTER_AUTH_SECRET: change-me
        OIDC_ISSUER: https://sso.brofrong.ru
        OIDC_CLIENT_ID: ...
        OIDC_CLIENT_SECRET: ...
      volumes: ["party-quiz-data:/data"]
  volumes: { party-quiz-data: {} }
  ```
- README: настройка клиента в SSO (redirect URI), прокси (WebSocket), переменные.

## Тестирование

- `bun test`:
  - `frame-reveal`: `reduce` (навигация, границы, пропуск выключенных, random →
    конкретная анимация), `publicView` (нет ответа до reveal, нет ответов других кадров,
    preload корректен).
  - GameEngine: start/stop/dispatch/reset, персист и восстановление, contentChanged.
  - tRPC: гость не может вызвать host-процедуры; `quiz.update` валидирует контент.
- E2E (Playwright, локально): ведущий (с тестовой SSO-сессией через dev-only bypass,
  включаемый `AUTH_DEV_BYPASS=1` только при `NODE_ENV!=production`) запускает
  викторину; две гостевые страницы получают кадр; «далее» и «открыть» синхронизируются;
  переподключение после разрыва возвращает текущий кадр.
- Ручная проверка: телефон по QR в локальной сети, вес кадров в DevTools.
