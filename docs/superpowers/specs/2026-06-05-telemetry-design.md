# Телеметрия: аналитика действий и логи ошибок — дизайн

**Дата:** 2026-06-05
**Проект:** Trener_Prod (Fastify + Postgres + Drizzle, два фронта: `apps/web` тренер, `apps/web-client` клиент; self-hosted в Docker)

## Цель

Своя подсистема телеметрии на существующей Postgres, без новой инфраструктуры и без
утечки данных наружу:

1. **Аналитика действий** — авто-трекинг переходов (page_view) и кликов на обоих фронтах,
   плюс явные именованные события.
2. **Логи ошибок** — необработанные ошибки на API и runtime-ошибки на обоих фронтах.

Атрибуция псевдонимна (только `id` аккаунта, без имён/PII). UI просмотра в v1 не делаем —
только сбор и хранение; смотреть через SQL. Дашборд — отдельная будущая фича.

## Решения (зафиксированы)

- **Охват:** оба фронта (`apps/web`, `apps/web-client`) + API (`apps/api`).
- **Аналитика:** авто page_view + авто click + явные события.
- **Идентификация:** по `id` аккаунта (`trainerId` / `clientAccountId`), псевдонимно.
- **Просмотр:** только сбор + SQL (без админ-экрана в v1).
- **Клиентский трекер:** общий пакет `packages/telemetry` (один на два фронта).
- **Запись:** прямой bulk-insert; батчинг на клиенте, fire-and-forget на сервере.

## Приватность (центральный инвариант)

У приложения мед/фитнес-данные (замеры, фото прогресса, чат). В телеметрию попадает
**только обезличенное**:

- `props` события содержит лишь: имя действия, метку элемента, путь. **Никогда** —
  значений `input`/`textarea`, имён, замеров, текста сообщений, ссылок на фото.
- Метка клика берётся только из: `data-track` → `aria-label` → роль/тип элемента →
  короткий текст кнопки/ссылки (обрезка до 64 символов). Поля ввода пропускаются.
- Атрибуция — только `id` (никаких имён/email).
- Стек/сообщение ошибки могут содержать данные — допустимо, т.к. хранилище внутреннее
  self-hosted; но в `context` ошибки PII не кладём.

## Модель данных (миграция 0032)

### `analytics_events` (append-only)

| колонка     | тип                                | примечание                                 |
| ----------- | ---------------------------------- | ------------------------------------------ |
| id          | text PK                            | cuid                                       |
| ts          | timestamptz NOT NULL default now() | время сервера                              |
| source      | text NOT NULL                      | `'client'` \| `'trainer'` (какой фронт)    |
| actor_type  | text NOT NULL                      | `'trainer'` \| `'client'` \| `'anon'`      |
| actor_id    | text NULL                          | trainerId / clientAccountId; null для anon |
| session_id  | text NOT NULL                      | сессия визита (sessionStorage)             |
| name        | text NOT NULL                      | `'page_view'` \| `'click'` \| явное имя    |
| path        | text NULL                          | маршрут фронта                             |
| props       | jsonb NOT NULL default '{}'        | обезличенные детали                        |
| ua          | text NULL                          | user-agent (обрезанный)                    |
| app_version | text NULL                          | сборка/commit                              |

Индексы: `(ts)`, `(actor_id)`, `(name)`, `(session_id)`.
CHECK: `source IN ('client','trainer')`, `actor_type IN ('trainer','client','anon')`.

### `error_logs` (append-only)

| колонка     | тип                                | примечание                             |
| ----------- | ---------------------------------- | -------------------------------------- |
| id          | text PK                            | cuid                                   |
| ts          | timestamptz NOT NULL default now() |                                        |
| source      | text NOT NULL                      | `'api'` \| `'client'` \| `'trainer'`   |
| level       | text NOT NULL                      | `'error'` \| `'warn'` \| `'fatal'`     |
| name        | text NULL                          | тип ошибки                             |
| message     | text NOT NULL                      |                                        |
| stack       | text NULL                          |                                        |
| path        | text NULL                          | URL запроса (API) или маршрут фронта   |
| method      | text NULL                          | HTTP-метод (API)                       |
| status_code | integer NULL                       | (API)                                  |
| actor_type  | text NULL                          | кто словил                             |
| actor_id    | text NULL                          |                                        |
| ua          | text NULL                          |                                        |
| context     | jsonb NOT NULL default '{}'        | reqId, componentStack и т.п. (без PII) |
| app_version | text NULL                          |                                        |

Индексы: `(ts)`, `(level)`, `(source)`.
CHECK: `source IN ('api','client','trainer')`, `level IN ('error','warn','fatal')`.

## Контракты (`packages/shared`, Zod)

`telemetry.ts`:

- `analyticsEventInputSchema`: `{ name, path?, props?, ts? }` — `props` ограничен по размеру
  (например ≤ 16 ключей, значения — примитивы/короткие строки), `name`/`path` обрезаются.
- `analyticsBatchRequestSchema`: `{ sessionId, source, events: analyticsEventInput[] }`
  (`events` — `.max(N)`, напр. 50).
- `clientErrorInputSchema`: `{ name?, message, stack?, path?, context? }`.
- `clientErrorBatchRequestSchema`: `{ source, sessionId?, errors: clientErrorInput[] }`.
- Ответы: `{ ok: true, accepted: number }`.

`source` от клиента валидируется как `'client'|'trainer'`; `actor_*` сервер проставляет сам.

## Бэкенд: модуль `apps/api/src/modules/telemetry/`

Слои как везде (routes → service → repo), `*.module.ts` — wiring, регистрация в `app.ts`.

- **repo** (`telemetry.repo.ts`): единственное место с SQL. `insertEvents(rows)`,
  `insertErrors(rows)` — bulk-insert. Никакого scope по тренеру (это админ-данные).
- **service** (`telemetry.service.ts`): принимает батч + контекст актора `{actorType, actorId}`;
  обрезает/санитизирует поля, проставляет `ts`/`id`, ограничивает размеры, делает bulk-insert.
  Невалидные элементы тихо отбрасывает (возвращает `accepted`).
- **routes** (`telemetry.routes.ts`):
  - `POST /api/telemetry/events` — батч аналитики.
  - `POST /api/telemetry/errors` — батч клиентских ошибок.
  - Атрибуция на сервере: `actorType/actorId` из `req.trainerId` (кука `sid`) или
    `req.clientAccountId` (кука `client_sid`); иначе `anon`. Тело-`actor_*` игнорируется.
  - Rate-limit (через существующий `@fastify/rate-limit`), без `requireAuth`/`requireClient`
    (эндпоинты принимают и анонимов, и оба типа сессий).
  - Ошибки самой телеметрии не влияют на UX: при сбое — `200 {ok:true, accepted:0}` или
    мягкий ответ; не роняем фронт.
- **module** (`telemetry.module.ts`): `registerTelemetryModule(app, {db, clock})`.

### Захват ошибок API

Расширяем существующий плагин `error-handler`: на ответах 5xx и необработанных исключениях
— запись в `error_logs` через telemetry-repo
(fire-and-forget, не блокируя ответ, ошибки записи глотаем). pino-логирование остаётся.
Контекст: `reqId`, `path`, `method`, `statusCode`, `actor_*` (если есть в запросе).
Опционально: `process.on('uncaughtException'|'unhandledRejection')` — best-effort запись
перед завершением (отдельный, помеченный как nice-to-have в плане).

## Клиент: пакет `packages/telemetry`

Один пакет, подключается в `apps/web` и `apps/web-client`. Конфигурируется через init
(`apiBaseUrl`, `source: 'client'|'trainer'`, `appVersion`).

- **sessionId**: генерится и хранится в `sessionStorage` (группировка визита).
- **Очередь + flush**: события буферизуются; flush каждые ~5с и на `pagehide`/
  `visibilitychange:hidden` через `fetch(url, {method:'POST', keepalive:true,
credentials:'include', body})`. Кап очереди (drop при переполнении).
- **Авто page_view**: маленький компонент/хук на react-router (`useLocation`) — на смену
  пути кладёт `{name:'page_view', path}`.
- **Авто click**: глобальный `document.addEventListener('click', …, {capture:true})` —
  извлекает безопасную метку (см. «Приватность»), кладёт `{name:'click', path, props:{label,tag}}`.
- **Явные события**: экспорт `track(name, props?)` для ключевых действий.
- **Ошибки**: `window.addEventListener('error')` + `'unhandledrejection'` → буфер ошибок →
  отдельный flush на `/api/telemetry/errors`. Плюс React **ErrorBoundary** на корне приложения
  (репорт `componentStack` + fallback-экран «Что-то пошло не так»). API-ошибки (4xx/5xx из
  `apiFetch`) НЕ репортим — их уже видит сервер.
- Без cookies/идентификаторов в localStorage сверх `sessionId`; актор определяется сервером
  по сессионной куке.

Подключение: в `main.tsx` каждого фронта — `initTelemetry({...})`; в `App` — рендер
`<TelemetryRouter/>` (page_view) и оборачивание в `<ErrorBoundary/>`.

## Тестирование

- **API unit** (`telemetry.service.test.ts`): атрибуция (trainer/client/anon), санитизация и
  обрезка, кап размеров, отбрасывание невалидного → корректный `accepted`.
- **API itest** (`telemetry.repo.itest.ts`, `telemetry.isolation.itest.ts`): bulk-insert и
  чтение; `POST /events|/errors` → строки в БД; атрибуция из куки `sid`/`client_sid`; аноним
  без куки; превышение батча/частоты → rate-limit/обрезка.
- **API itest захвата ошибок**: запрос, дающий 5xx → строка в `error_logs`.
- **Клиент unit** (в `packages/telemetry`): извлечение метки клика (санитизация, пропуск
  input), буфер/flush (мок fetch), `sessionId`, постановка ошибок в очередь.
- **Клиент**: тест `ErrorBoundary` (рендерит fallback и репортит).

## Объём и ретеншн

- v1 без авто-очистки. Заметка на будущее: периодическая чистка `DELETE … WHERE ts <
now() - interval '90 days'` (cron/SQL-задача) — отдельная задача, не в этом плане.
- Защита от объёма авто-кликов: батчинг на клиенте, кап батча на сервере, rate-limit,
  drop очереди при переполнении.

## Вне объёма (v1)

- Админ-дашборд/визуализация (только сбор + SQL).
- Группировка/дедуп ошибок, алерты (как в Sentry) — нет.
- Воркер/очередь записи (прямой insert).
- Авто-ретеншн/чистка (только заметка).
- Трекинг бэкенд-«действий» в аналитику (бэк пишет только ошибки; аналитика действий — с фронтов).

## Файловая структура

```
packages/shared/src/telemetry.ts            # Zod-контракты (+ экспорт в index)
packages/telemetry/                         # клиентский трекер (новый пакет)
  src/index.ts                              # initTelemetry, track, TelemetryRouter, ErrorBoundary
  src/queue.ts                              # буфер + flush
  src/clicks.ts                             # извлечение безопасной метки клика
  src/errors.ts                             # window error/unhandledrejection
  package.json / tsconfig
apps/api/src/db/schema.ts                   # +analytics_events, +error_logs
apps/api/drizzle/0032_*.sql                 # миграция
apps/api/src/modules/telemetry/
  telemetry.repo.ts / service.ts / routes.ts / module.ts / *.itest.ts / service.test.ts
apps/api/src/app.ts                         # registerTelemetryModule
apps/api/src/plugins/error-handler.ts       # +запись 5xx/необработанных в error_logs
apps/web/src/main.tsx, App.tsx              # initTelemetry + TelemetryRouter + ErrorBoundary
apps/web-client/src/main.tsx, App.tsx       # то же
```
