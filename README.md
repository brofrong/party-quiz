# Party Quiz 🎉

Викторина для вечеринки в реальном времени. Ведущий управляет игрой со своего устройства
(`/admin`), гости и телевизор открывают сайт по QR-коду и синхронно видят текущий экран.

Первая викторина — **«Угадай кадр»**: кадр из фильма, мультика или мема с чёрным квадратом,
который по команде ведущего исчезает одной из шести анимаций. Новые типы викторин
добавляются отдельными модулями (см. ниже).

Стек: Bun (сервер, бандлер, тесты), React 19, Tailwind v4 + shadcn/ui, motion, tRPC v11
(HTTP + WebSocket), Better Auth (SSO + анонимные гости), SQLite + Drizzle, Biome.

## Быстрый старт

```bash
bun install
AUTH_DEV_BYPASS=1 bun run dev
```

- `http://localhost:3000` — экран гостя/ТВ (лобби с QR, пока игра не запущена).
- `http://localhost:3000/admin` → «Dev-вход» — пульт ведущего без SSO (только при
  `AUTH_DEV_BYPASS=1` и не в production).

## Скрипты

| Команда | Что делает |
|---|---|
| `bun run dev` | dev-сервер с hot reload |
| `bun run build` | production-сборка в `dist/` (сервер + оба фронтенда + миграции, контент, медиа) |
| `bun run start` | запуск production-сборки из `dist/` |
| `bun test` | unit- и интеграционные тесты |
| `bun run e2e` | браузерный e2e (нужен Google Chrome, путь — `CHROME_PATH`) |
| `bun run check` / `bun run format` | Biome: проверка / автоисправление |
| `bun run typecheck` | TypeScript |
| `bun run db:generate` | новая миграция Drizzle после изменения `src/server/db/schema.ts` |
| `bun run media:import -- …` | импорт кадров (см. ниже) |
| `bun run seed:reset [id]` | перезаписать викторину в базе данными из `content/quizzes` |

## Деплой (docker compose / Arcane)

Образ собирается GitHub Action'ом при пуше в `main`: `ghcr.io/brofrong/party-quiz:latest`
(+ теги `sha-…` и `vX.Y.Z` для git-тегов), платформы `linux/amd64` и `linux/arm64`.

1. Скопируй `docker-compose.yml` и `.env.example` → `.env`, заполни переменные:

   | Переменная | Описание |
   |---|---|
   | `BETTER_AUTH_URL` | публичный адрес сайта, например `https://quiz.brofrong.ru` |
   | `BETTER_AUTH_SECRET` | случайная строка ≥ 32 символов: `openssl rand -base64 32` |
   | `OIDC_ISSUER` | адрес SSO, по умолчанию `https://sso.brofrong.ru` |
   | `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | клиент из SSO (см. ниже) |
   | `PARTY_QUIZ_PORT` | порт на хосте, по умолчанию `3000` |

2. Данные (SQLite: пользователи, викторины с твоими правками, состояние игры) лежат в
   volume `party-quiz-data` (`/data` в контейнере).

### Клиент в SSO

- Тип: confidential (с секретом), PKCE включён.
- Redirect URI: `https://<домен>/api/auth/callback/sso`
  (для локальной разработки ещё `http://localhost:3000/api/auth/callback/sso`).
- Scopes: `openid profile email`.
- Ведущим может быть любой пользователь, вошедший через SSO.

### Обратный прокси

- Проксируй всё на порт контейнера. Гостям нужен **WebSocket** на `/api/trpc`:
  в Nginx Proxy Manager включи «Websockets Support»; Traefik и Caddy проксируют WebSocket
  сами.
- Включи **gzip/brotli** для `text/javascript` и `text/css` в прокси: приложение отдаёт
  JS без сжатия (≈580 КБ → ≈180 КБ в gzip). Картинки уже сжаты (AVIF/WebP) и кэшируются
  навсегда.

## Добавить кадры

```bash
bun run media:import -- --selection ../викторина --frames ../кадры --items ../fetch.py
```

Скрипт сжимает оригиналы в AVIF + WebP (1280 и 1920 px), пишет их в `public/media/` и
генерирует `content/quizzes/frames.json`. Закоммить оба и задеплой новый образ.

Новые картинки появятся сразу, но контент из репозитория **не перезаписывает** базу, в которой
уже есть эта викторина (правки из админки важнее). Чтобы залить его принудительно (правки из
админки пропадут):

```bash
docker exec party-quiz bun seed-reset.js frames   # в контейнере
docker restart party-quiz
bun run seed:reset frames                          # локально
```

## Новый тип викторины

1. `src/quizzes/<тип>/schema.ts`, `logic.ts`, `module.ts` — серверная часть по контракту
   `QuizModule` из `src/quizzes/types.ts` (схемы zod, чистый `reduce`, `publicView` без
   секретов, `hostView`). Зарегистрируй в `src/quizzes/registry.server.ts`.
2. `src/quizzes/<тип>/client/` — компоненты `Player`, `HostConsole`, `Editor`.
   Зарегистрируй в `src/quizzes/registry.player.ts` (только `Player` — бандл гостя)
   и `src/quizzes/registry.admin.ts`.
3. Сид: `content/quizzes/<id>.json` с полями `id`, `type`, `title`, `content`.
