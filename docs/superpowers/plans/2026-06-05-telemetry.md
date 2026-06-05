# Телеметрия (аналитика действий + логи ошибок) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: используйте superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans, выполняя план по задачам. Шаги помечены чекбоксами (`- [ ]`).

**Goal:** Своя подсистема телеметрии на существующей Postgres: авто-аналитика действий (page_view/click/явные) с обоих фронтов + сбор необработанных ошибок API и runtime-ошибок фронтов; атрибуция псевдонимна по id; без UI (сбор + SQL).

**Architecture:** Две append-only таблицы (`analytics_events`, `error_logs`). Модуль `telemetry` на API (repo/service/routes, как везде) с `POST /api/telemetry/events|errors`; атрибуция актора — на сервере по куке. Захват 5xx — через фабрику `makeErrorHandler`. Клиентский трекер — общий пакет `packages/telemetry` (зеркало `@trener/shared`), подключается в оба фронта: буфер+flush, авто page_view (react-router), авто click (санитизация), `track()`, перехват `error`/`unhandledrejection`, корневой `ErrorBoundary`.

**Tech Stack:** Fastify 5, Drizzle, Postgres 16, Zod (`@trener/shared`), React 18 + react-router 6, Vite, Vitest, npm workspaces.

**Спека:** `docs/superpowers/specs/2026-06-05-telemetry-design.md`.

**Контроллеру (важно):** применение миграций к БД (`db:migrate` к `trener` и `trener_test`) и любые `docker compose` — выполняет контроллер, НЕ сабагенты. itest-ы — только против `trener_test`.

---

## Структура файлов

```
packages/shared/src/telemetry.ts                    # CREATE — Zod-контракты
packages/shared/src/telemetry.test.ts               # CREATE — unit
packages/shared/src/index.ts                        # MODIFY — экспорт
apps/api/src/db/schema.ts                           # MODIFY — +analytics_events, +error_logs
apps/api/drizzle/0032_*.sql                         # CREATE (db:generate)
apps/api/src/modules/telemetry/telemetry.repo.ts    # CREATE
apps/api/src/modules/telemetry/telemetry.service.ts # CREATE
apps/api/src/modules/telemetry/telemetry.service.test.ts  # CREATE
apps/api/src/modules/telemetry/telemetry.routes.ts  # CREATE
apps/api/src/modules/telemetry/telemetry.module.ts  # CREATE
apps/api/src/modules/telemetry/telemetry.isolation.itest.ts  # CREATE
apps/api/src/plugins/error-handler.ts               # MODIFY — makeErrorHandler
apps/api/src/plugins/error-handler.itest.ts         # CREATE — 5xx → error_logs
apps/api/src/app.ts                                 # MODIFY — wiring
packages/telemetry/package.json                     # CREATE (новый пакет)
packages/telemetry/tsconfig.json                    # CREATE
packages/telemetry/tsconfig.build.json              # CREATE
packages/telemetry/src/config.ts                    # CREATE
packages/telemetry/src/queue.ts                     # CREATE
packages/telemetry/src/queue.test.ts                # CREATE
packages/telemetry/src/clicks.ts                    # CREATE
packages/telemetry/src/clicks.test.ts               # CREATE
packages/telemetry/src/track.ts                     # CREATE
packages/telemetry/src/errors.ts                    # CREATE
packages/telemetry/src/TelemetryRouter.tsx          # CREATE
packages/telemetry/src/ErrorBoundary.tsx            # CREATE
packages/telemetry/src/ErrorBoundary.test.tsx       # CREATE
packages/telemetry/src/index.ts                     # CREATE
apps/web-client/package.json                        # MODIFY — dep @trener/telemetry
apps/web-client/Dockerfile                          # MODIFY — build telemetry
apps/web-client/src/main.tsx                        # MODIFY — initTelemetry + ErrorBoundary
apps/web-client/src/App.tsx                         # MODIFY — <TelemetryRouter/>
apps/web/package.json                               # MODIFY — dep @trener/telemetry
apps/web/Dockerfile                                 # MODIFY — build telemetry
apps/web/src/main.tsx                               # MODIFY — initTelemetry + ErrorBoundary
apps/web/src/App.tsx                                # MODIFY — <TelemetryRouter/>
```

---

## Task 1: Zod-контракты телеметрии (`@trener/shared`)

**Files:**

- Create: `packages/shared/src/telemetry.ts`
- Create: `packages/shared/src/telemetry.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Падающий тест**

`packages/shared/src/telemetry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { analyticsBatchRequestSchema, clientErrorBatchRequestSchema } from './telemetry.js';

describe('telemetry contracts', () => {
  it('принимает валидный батч событий', () => {
    const r = analyticsBatchRequestSchema.parse({
      source: 'client',
      sessionId: 's1',
      events: [{ name: 'page_view', path: '/workouts', props: { label: 'x' } }],
    });
    expect(r.events).toHaveLength(1);
  });

  it('отклоняет неизвестный source и пустое имя', () => {
    expect(() =>
      analyticsBatchRequestSchema.parse({ source: 'api', sessionId: 's', events: [] }),
    ).toThrow();
    expect(() =>
      analyticsBatchRequestSchema.parse({
        source: 'client',
        sessionId: 's',
        events: [{ name: '' }],
      }),
    ).toThrow();
  });

  it('батч ошибок требует message', () => {
    const r = clientErrorBatchRequestSchema.parse({
      source: 'trainer',
      errors: [{ message: 'boom', stack: 'at x' }],
    });
    expect(r.errors[0]?.message).toBe('boom');
    expect(() => clientErrorBatchRequestSchema.parse({ source: 'client', errors: [{}] })).toThrow();
  });
});
```

- [ ] **Step 2: Запустить — упадёт** (нет модуля)

Run: `npx vitest run packages/shared/src/telemetry.test.ts`
Expected: FAIL — Cannot find module './telemetry.js'.

- [ ] **Step 3: Реализация**

`packages/shared/src/telemetry.ts`:

```ts
import { z } from 'zod';

export const telemetrySourceSchema = z.enum(['client', 'trainer']);
export type TelemetrySource = z.infer<typeof telemetrySourceSchema>;

// Значение props/context: только примитив (сложное отбросит сервер).
const propValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

export const analyticsEventInputSchema = z.object({
  name: z.string().min(1).max(64),
  path: z.string().max(512).nullish(),
  props: z.record(propValue).optional(),
});
export type AnalyticsEventInput = z.infer<typeof analyticsEventInputSchema>;

export const analyticsBatchRequestSchema = z.object({
  source: telemetrySourceSchema,
  sessionId: z.string().min(1).max(64),
  events: z.array(analyticsEventInputSchema).max(50),
});
export type AnalyticsBatchRequest = z.infer<typeof analyticsBatchRequestSchema>;

export const clientErrorInputSchema = z.object({
  name: z.string().max(200).nullish(),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).nullish(),
  path: z.string().max(512).nullish(),
  context: z.record(propValue).optional(),
});
export type ClientErrorInput = z.infer<typeof clientErrorInputSchema>;

export const clientErrorBatchRequestSchema = z.object({
  source: telemetrySourceSchema,
  sessionId: z.string().max(64).nullish(),
  errors: z.array(clientErrorInputSchema).max(20),
});
export type ClientErrorBatchRequest = z.infer<typeof clientErrorBatchRequestSchema>;

export const telemetryAcceptResponseSchema = z.object({
  ok: z.literal(true),
  accepted: z.number().int(),
});
export type TelemetryAcceptResponse = z.infer<typeof telemetryAcceptResponseSchema>;
```

Добавить в `packages/shared/src/index.ts` после строки `export * from './client-templates.js';`:

```ts
export * from './telemetry.js';
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npx vitest run packages/shared/src/telemetry.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Собрать shared (нужно для типов в API)**

Run: `npm run build -w @trener/shared`
Expected: tsc без ошибок.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/telemetry.ts packages/shared/src/telemetry.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): контракты телеметрии (события и ошибки)"
```

---

## Task 2: Таблицы БД + миграция

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Create (через генератор): `apps/api/drizzle/0032_*.sql`

- [ ] **Step 1: Добавить таблицы**

В `apps/api/src/db/schema.ts` (импорты `pgTable,text,timestamp,integer,jsonb,index,check` уже есть; `sql` импортирован) добавить в конец файла:

```ts
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: text('id').primaryKey(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    source: text('source').$type<'client' | 'trainer'>().notNull(),
    actorType: text('actor_type').$type<'trainer' | 'client' | 'anon'>().notNull(),
    actorId: text('actor_id'),
    sessionId: text('session_id').notNull(),
    name: text('name').notNull(),
    path: text('path'),
    props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
    ua: text('ua'),
    appVersion: text('app_version'),
  },
  (t) => [
    index('analytics_events_ts_idx').on(t.ts),
    index('analytics_events_actor_idx').on(t.actorId),
    index('analytics_events_name_idx').on(t.name),
    check('analytics_events_source_chk', sql`${t.source} IN ('client', 'trainer')`),
    check('analytics_events_actor_type_chk', sql`${t.actorType} IN ('trainer', 'client', 'anon')`),
  ],
);

export const errorLogs = pgTable(
  'error_logs',
  {
    id: text('id').primaryKey(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    source: text('source').$type<'api' | 'client' | 'trainer'>().notNull(),
    level: text('level').$type<'error' | 'warn' | 'fatal'>().notNull(),
    name: text('name'),
    message: text('message').notNull(),
    stack: text('stack'),
    path: text('path'),
    method: text('method'),
    statusCode: integer('status_code'),
    actorType: text('actor_type'),
    actorId: text('actor_id'),
    ua: text('ua'),
    context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
    appVersion: text('app_version'),
  },
  (t) => [
    index('error_logs_ts_idx').on(t.ts),
    index('error_logs_level_idx').on(t.level),
    index('error_logs_source_idx').on(t.source),
    check('error_logs_source_chk', sql`${t.source} IN ('api', 'client', 'trainer')`),
    check('error_logs_level_chk', sql`${t.level} IN ('error', 'warn', 'fatal')`),
  ],
);
```

- [ ] **Step 2: Сгенерировать миграцию (без БД)**

Run: `npm run db:generate -w @trener/api`
Expected: создан `apps/api/drizzle/0032_*.sql` с `CREATE TABLE "analytics_events"` и `"error_logs"` и НИЧЕГО лишнего (проверить глазами).

- [ ] **Step 3: Типы**

Run: `npm run typecheck`
Expected: зелёно.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/0032_*.sql apps/api/drizzle/meta
git commit -m "feat(db): таблицы analytics_events и error_logs (миграция 0032)"
```

- [ ] **Step 5 (КОНТРОЛЛЕР, не сабагент): применить миграцию**

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/trener" npm run db:migrate -w @trener/api
DATABASE_URL="postgres://postgres:postgres@localhost:5432/trener_test" npm run db:migrate -w @trener/api
```

Проверка: `\d analytics_events` и `\d error_logs` есть в обеих БД.

---

## Task 3: Репозиторий телеметрии + itest

**Files:**

- Create: `apps/api/src/modules/telemetry/telemetry.repo.ts`
- Create: `apps/api/src/modules/telemetry/telemetry.isolation.itest.ts` (репо-часть здесь же)

- [ ] **Step 1: Реализация repo**

`apps/api/src/modules/telemetry/telemetry.repo.ts`:

```ts
import type { Db } from '../../db/client.js';
import { analyticsEvents, errorLogs } from '../../db/schema.js';

export type AnalyticsEventRow = typeof analyticsEvents.$inferInsert;
export type ErrorLogRow = typeof errorLogs.$inferInsert;

// Телеметрия — админ-данные без тенант-скоупа (осознанное исключение из CLAUDE.md).
export function makeTelemetryRepo(db: Db) {
  return {
    async insertEvents(rows: AnalyticsEventRow[]): Promise<void> {
      if (rows.length === 0) return;
      await db.insert(analyticsEvents).values(rows);
    },
    async insertErrors(rows: ErrorLogRow[]): Promise<void> {
      if (rows.length === 0) return;
      await db.insert(errorLogs).values(rows);
    },
  };
}

export type TelemetryRepo = ReturnType<typeof makeTelemetryRepo>;
```

- [ ] **Step 2: Типы**

Run: `npm run typecheck`
Expected: зелёно. (itest на repo вынесен в Task 5 через HTTP — отдельный repo-itest не нужен, bulk-insert проверится роутами.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/telemetry/telemetry.repo.ts
git commit -m "feat(api): telemetry repo (bulk-insert событий и ошибок)"
```

---

## Task 4: Сервис телеметрии + unit-тест

**Files:**

- Create: `apps/api/src/modules/telemetry/telemetry.service.ts`
- Create: `apps/api/src/modules/telemetry/telemetry.service.test.ts`

- [ ] **Step 1: Падающий тест**

`apps/api/src/modules/telemetry/telemetry.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { makeTelemetryService } from './telemetry.service.js';
import type { TelemetryRepo, AnalyticsEventRow, ErrorLogRow } from './telemetry.repo.js';

function fakeRepo() {
  const events: AnalyticsEventRow[][] = [];
  const errors: ErrorLogRow[][] = [];
  const repo: TelemetryRepo = {
    insertEvents: vi.fn(async (rows) => void events.push(rows)),
    insertErrors: vi.fn(async (rows) => void errors.push(rows)),
  };
  return { repo, events, errors };
}

const deps = { newId: () => 'id1' };

describe('telemetry service', () => {
  it('атрибутирует актора и санитизирует props (только примитивы, кап ключей)', async () => {
    const { repo, events } = fakeRepo();
    const svc = makeTelemetryService(repo, deps);
    const big: Record<string, unknown> = { a: 'x', bad: { nested: 1 } };
    for (let i = 0; i < 30; i++) big[`k${String(i)}`] = i;
    const n = await svc.ingestEvents(
      { source: 'client', sessionId: 's1', events: [{ name: 'click', props: big }] },
      { actorType: 'client', actorId: 'ca1' },
      'UA',
    );
    expect(n).toBe(1);
    const row = events[0]![0]!;
    expect(row.actorType).toBe('client');
    expect(row.actorId).toBe('ca1');
    expect(Object.keys(row.props as object).length).toBeLessThanOrEqual(16);
    expect((row.props as Record<string, unknown>).bad).toBeUndefined(); // объект отброшен
  });

  it('recordApiError пишет одну строку source=api', async () => {
    const { repo, errors } = fakeRepo();
    const svc = makeTelemetryService(repo, deps);
    await svc.recordApiError({
      message: 'boom',
      actorType: 'anon',
      actorId: null,
      statusCode: 500,
      path: '/x',
      method: 'GET',
    });
    expect(errors[0]![0]!.source).toBe('api');
    expect(errors[0]![0]!.message).toBe('boom');
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npx vitest run apps/api/src/modules/telemetry/telemetry.service.test.ts`
Expected: FAIL — нет модуля service.

- [ ] **Step 3: Реализация**

`apps/api/src/modules/telemetry/telemetry.service.ts`:

```ts
import type { AnalyticsBatchRequest, ClientErrorBatchRequest } from '@trener/shared';
import type { TelemetryRepo, AnalyticsEventRow, ErrorLogRow } from './telemetry.repo.js';

export type ActorType = 'trainer' | 'client' | 'anon';
export type Actor = { actorType: ActorType; actorId: string | null };
export type TelemetryDeps = { newId: () => string };

const MAX_PROPS_KEYS = 16;

// Оставляем только примитивы; строки обрезаем; не более MAX_PROPS_KEYS ключей.
function clampProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) return {};
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n >= MAX_PROPS_KEYS) break;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
      n++;
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, 200);
      n++;
    }
  }
  return out;
}

function clampUa(ua: string | null): string | null {
  return ua ? ua.slice(0, 400) : null;
}

export function makeTelemetryService(repo: TelemetryRepo, deps: TelemetryDeps) {
  return {
    async ingestEvents(
      batch: AnalyticsBatchRequest,
      actor: Actor,
      ua: string | null,
    ): Promise<number> {
      const rows: AnalyticsEventRow[] = batch.events.map((e) => ({
        id: deps.newId(),
        source: batch.source,
        actorType: actor.actorType,
        actorId: actor.actorId,
        sessionId: batch.sessionId,
        name: e.name.slice(0, 64),
        path: e.path ? e.path.slice(0, 512) : null,
        props: clampProps(e.props),
        ua: clampUa(ua),
      }));
      await repo.insertEvents(rows);
      return rows.length;
    },

    async ingestClientErrors(
      batch: ClientErrorBatchRequest,
      actor: Actor,
      ua: string | null,
    ): Promise<number> {
      const rows: ErrorLogRow[] = batch.errors.map((e) => ({
        id: deps.newId(),
        source: batch.source,
        level: 'error',
        name: e.name ?? null,
        message: e.message.slice(0, 2000),
        stack: e.stack ?? null,
        path: e.path ?? null,
        actorType: actor.actorType,
        actorId: actor.actorId,
        ua: clampUa(ua),
        context: clampProps(e.context),
      }));
      await repo.insertErrors(rows);
      return rows.length;
    },

    async recordApiError(input: {
      message: string;
      name?: string | null;
      stack?: string | null;
      path?: string | null;
      method?: string | null;
      statusCode?: number | null;
      actorType: ActorType;
      actorId: string | null;
      context?: Record<string, unknown>;
    }): Promise<void> {
      const row: ErrorLogRow = {
        id: deps.newId(),
        source: 'api',
        level: 'error',
        name: input.name ?? null,
        message: input.message.slice(0, 2000),
        stack: input.stack ?? null,
        path: input.path ?? null,
        method: input.method ?? null,
        statusCode: input.statusCode ?? null,
        actorType: input.actorType,
        actorId: input.actorId,
        context: clampProps(input.context),
      };
      await repo.insertErrors([row]);
    },
  };
}

export type TelemetryService = ReturnType<typeof makeTelemetryService>;
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npx vitest run apps/api/src/modules/telemetry/telemetry.service.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/telemetry/telemetry.service.ts apps/api/src/modules/telemetry/telemetry.service.test.ts
git commit -m "feat(api): telemetry service (атрибуция, санитизация, капы)"
```

---

## Task 5: Роуты + модуль + регистрация + isolation itest

**Files:**

- Create: `apps/api/src/modules/telemetry/telemetry.routes.ts`
- Create: `apps/api/src/modules/telemetry/telemetry.module.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/modules/telemetry/telemetry.isolation.itest.ts`

- [ ] **Step 1: Роуты**

`apps/api/src/modules/telemetry/telemetry.routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  analyticsBatchRequestSchema,
  clientErrorBatchRequestSchema,
  telemetryAcceptResponseSchema,
} from '@trener/shared';
import type { TelemetryService, Actor } from './telemetry.service.js';

function actorOf(req: FastifyRequest): Actor {
  if (req.trainerId) return { actorType: 'trainer', actorId: req.trainerId };
  if (req.clientAccountId) return { actorType: 'client', actorId: req.clientAccountId };
  return { actorType: 'anon', actorId: null };
}

export function telemetryRoutes(app: FastifyInstance, svc: TelemetryService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/telemetry/events',
    {
      schema: {
        body: analyticsBatchRequestSchema,
        response: { 200: telemetryAcceptResponseSchema },
      },
    },
    async (req) => {
      const ua = req.headers['user-agent'] ?? null;
      let accepted = 0;
      try {
        accepted = await svc.ingestEvents(req.body, actorOf(req), ua);
      } catch (err) {
        req.log.warn({ err }, 'telemetry events ingest failed');
      }
      return { ok: true as const, accepted };
    },
  );

  typed.post(
    '/api/telemetry/errors',
    {
      schema: {
        body: clientErrorBatchRequestSchema,
        response: { 200: telemetryAcceptResponseSchema },
      },
    },
    async (req) => {
      const ua = req.headers['user-agent'] ?? null;
      let accepted = 0;
      try {
        accepted = await svc.ingestClientErrors(req.body, actorOf(req), ua);
      } catch (err) {
        req.log.warn({ err }, 'telemetry errors ingest failed');
      }
      return { ok: true as const, accepted };
    },
  );
}
```

- [ ] **Step 2: Модуль (rate-limit scope + фабрика сервиса)**

`apps/api/src/modules/telemetry/telemetry.module.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeTelemetryRepo } from './telemetry.repo.js';
import { makeTelemetryService, type TelemetryService } from './telemetry.service.js';
import { telemetryRoutes } from './telemetry.routes.js';

// Сервис нужен и роутам, и error-handler — создаём отдельно.
export function makeTelemetry(db: Db, clock: Clock): TelemetryService {
  return makeTelemetryService(makeTelemetryRepo(db), { newId: clock.newId });
}

// Роуты в отдельном scope с rate-limit (телеметрия может быть «болтливой»).
export async function registerTelemetryRoutes(
  app: FastifyInstance,
  svc: TelemetryService,
): Promise<void> {
  await app.register(async (scope) => {
    await scope.register(rateLimit, { max: 120, timeWindow: '1 minute' });
    telemetryRoutes(scope, svc);
  });
}
```

- [ ] **Step 3: Wiring в `apps/api/src/app.ts` (только телеметрия; error-handler — в Task 6)**

Импорт (рядом с прочими модулями):

```ts
import { makeTelemetry, registerTelemetryRoutes } from './modules/telemetry/telemetry.module.js';
```

После создания `clock` (строка `const clock = realClock;`) добавить:

```ts
const telemetry = makeTelemetry(deps.db, clock);
```

Рядом с регистрацией клиентских модулей (после `registerClientAppTemplatesModule(...)`) добавить:

```ts
await registerTelemetryRoutes(app, telemetry);
```

> `app.setErrorHandler(errorHandler)` пока НЕ трогаем — его переключим на фабрику с записью
> в Task 6 (там же используем уже созданную здесь `const telemetry`).

- [ ] **Step 4: isolation itest**

`apps/api/src/modules/telemetry/telemetry.isolation.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('telemetry (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM analytics_events`);
    await db.execute(sql`DELETE FROM error_logs`);
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  it('аноним: события пишутся с actor_type=anon', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/telemetry/events',
      payload: { source: 'client', sessionId: 's1', events: [{ name: 'page_view', path: '/' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ accepted: number }>().accepted).toBe(1);
    const rows = await db.execute(sql`SELECT actor_type FROM analytics_events`);
    expect(rows[0]?.actor_type).toBe('anon');
  });

  it('тренер: атрибуция по куке sid (actor_type=trainer)', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'tm@b.co', password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const sid = reg.cookies.find((c) => c.name === 'sid')!.value;
    await app.inject({
      method: 'POST',
      url: '/api/telemetry/events',
      cookies: { sid },
      payload: { source: 'trainer', sessionId: 's2', events: [{ name: 'click' }] },
    });
    const rows = await db.execute(
      sql`SELECT actor_type FROM analytics_events WHERE session_id = 's2'`,
    );
    expect(rows[0]?.actor_type).toBe('trainer');
  });

  it('клиентские ошибки пишутся в error_logs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/telemetry/errors',
      payload: { source: 'client', errors: [{ message: 'boom', stack: 'at x' }] },
    });
    expect(res.statusCode).toBe(200);
    const rows = await db.execute(
      sql`SELECT source, message FROM error_logs WHERE source = 'client'`,
    );
    expect(rows[0]?.message).toBe('boom');
  });
});
```

- [ ] **Step 5: Запустить itest (против trener_test)**

Run: `DATABASE_URL="postgres://postgres:postgres@localhost:5432/trener_test" npx vitest run apps/api/src/modules/telemetry/telemetry.isolation.itest.ts`
Expected: PASS (3 теста).

- [ ] **Step 6: Типы**

Run: `npm run typecheck`
Expected: зелёно.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/telemetry/telemetry.routes.ts apps/api/src/modules/telemetry/telemetry.module.ts apps/api/src/modules/telemetry/telemetry.isolation.itest.ts apps/api/src/app.ts
git commit -m "feat(api): эндпоинты телеметрии /events и /errors + атрибуция по куке"
```

---

## Task 6: Захват ошибок API через `makeErrorHandler`

**Files:**

- Modify: `apps/api/src/plugins/error-handler.ts`
- Create: `apps/api/src/plugins/error-handler.itest.ts`

- [ ] **Step 1: Рефактор в фабрику + запись 5xx**

Заменить содержимое `apps/api/src/plugins/error-handler.ts` на:

```ts
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../errors.js';

export type ErrorRecord = {
  message: string;
  name?: string | null;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  actorType: 'trainer' | 'client' | 'anon';
  actorId: string | null;
  context?: Record<string, unknown>;
};
export type ErrorRecorder = (e: ErrorRecord) => void;

export function makeErrorHandler(opts: { recordError?: ErrorRecorder } = {}) {
  return function errorHandler(
    error: FastifyError | AppError | ZodError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    if (hasZodFastifySchemaValidationErrors(error)) {
      void reply.status(400).send({
        error: 'Ошибка валидации',
        code: 'VALIDATION_ERROR',
        details: error.validation,
      });
      return;
    }
    if (error instanceof AppError) {
      void reply.status(error.status).send({
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }
    if (error instanceof ZodError) {
      void reply.status(400).send({
        error: 'Ошибка валидации',
        code: 'VALIDATION_ERROR',
        details: error.flatten(),
      });
      return;
    }
    if (
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : 'CLIENT_ERROR';
      void reply.status(error.statusCode).send({ error: error.message, code });
      return;
    }
    request.log.error({ err: error }, 'Необработанная ошибка');
    if (opts.recordError) {
      const actorType = request.trainerId ? 'trainer' : request.clientAccountId ? 'client' : 'anon';
      const actorId = request.trainerId ?? request.clientAccountId ?? null;
      opts.recordError({
        message: error.message,
        name: error.name,
        stack: error.stack,
        path: request.url,
        method: request.method,
        statusCode: 500,
        actorType,
        actorId,
        context: { reqId: String(request.id) },
      });
    }
    void reply.status(500).send({ error: 'Внутренняя ошибка сервера', code: 'INTERNAL' });
  };
}

// Обратносовместимый дефолт (без записи) — на случай прямых импортов.
export const errorHandler = makeErrorHandler();
```

- [ ] **Step 2: app.ts — переключить error-handler на фабрику с записью**

В `apps/api/src/app.ts` заменить импорт:

```ts
import { errorHandler } from './plugins/error-handler.js';
```

на:

```ts
import { makeErrorHandler } from './plugins/error-handler.js';
```

Удалить раннюю строку `app.setErrorHandler(errorHandler);` (в начале `buildApp`) и вместо неё
ПОСЛЕ строки `const telemetry = makeTelemetry(deps.db, clock);` (добавлена в Task 5) поставить:

```ts
app.setErrorHandler(
  makeErrorHandler({
    recordError: (e) => {
      void telemetry.recordApiError(e).catch(() => undefined);
    },
  }),
);
```

> setErrorHandler можно вызывать до регистрации роутов; важно лишь, что `telemetry` уже создан.

- [ ] **Step 3: itest — 5xx пишет строку в error_logs**

`apps/api/src/plugins/error-handler.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { createDb } from '../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('error-handler capture (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM error_logs`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    // Тест-роут, бросающий «серверную» ошибку.
    app.get('/__boom', () => {
      throw new Error('kaboom');
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  it('5xx пишется в error_logs с source=api', async () => {
    const res = await app.inject({ method: 'GET', url: '/__boom' });
    expect(res.statusCode).toBe(500);
    // recordError — fire-and-forget; дожидаемся вставки.
    await new Promise((r) => setTimeout(r, 100));
    const rows = await db.execute(
      sql`SELECT source, status_code, message FROM error_logs WHERE source = 'api'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.status_code).toBe(500);
    expect(rows[0]?.message).toBe('kaboom');
  });
});
```

- [ ] **Step 4: Запустить itest**

Run: `DATABASE_URL="postgres://postgres:postgres@localhost:5432/trener_test" npx vitest run apps/api/src/plugins/error-handler.itest.ts`
Expected: PASS.

- [ ] **Step 5: Типы**

Run: `npm run typecheck`
Expected: зелёно (app.ts теперь использует `makeErrorHandler({recordError})` и `telemetry`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/plugins/error-handler.ts apps/api/src/plugins/error-handler.itest.ts apps/api/src/app.ts
git commit -m "feat(api): запись необработанных 5xx в error_logs"
```

---

## Task 7: Скаффолд пакета `packages/telemetry` + подключение

**Files:**

- Create: `packages/telemetry/package.json`, `tsconfig.json`, `tsconfig.build.json`
- Modify: `apps/web-client/package.json`, `apps/web/package.json`
- Modify: `apps/web-client/Dockerfile`, `apps/web/Dockerfile`

- [ ] **Step 1: package.json пакета**

`packages/telemetry/package.json`:

```json
{
  "name": "@trener/telemetry",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b tsconfig.build.json"
  },
  "peerDependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "typescript": "^6.0.3"
  }
}
```

- [ ] **Step 2: tsconfig'и пакета**

`packages/telemetry/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"]
}
```

`packages/telemetry/tsconfig.build.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
}
```

- [ ] **Step 3: Зависимость в обоих фронтах**

В `apps/web-client/package.json` и `apps/web/package.json` в `dependencies` добавить:

```json
    "@trener/telemetry": "*",
```

- [ ] **Step 4: Dockerfile обоих фронтов**

`apps/web-client/Dockerfile` — добавить копирование package.json и сборку:

```dockerfile
COPY packages/telemetry/package.json packages/telemetry/
```

(рядом с другими `COPY packages/*/package.json`), и

```dockerfile
COPY packages/telemetry packages/telemetry
```

(рядом с другими `COPY packages/*`), и заменить строку сборки на:

```dockerfile
RUN npm run build -w @trener/shared && npm run build -w @trener/telemetry && npm run build -w @trener/web-client
```

Аналогично в `apps/web/Dockerfile` (заменить `@trener/web-client` на `@trener/web`).

- [ ] **Step 5: Установить и проверить резолв**

Run: `npm install`
Expected: workspace-симлинк `node_modules/@trener/telemetry` создан.

- [ ] **Step 6: Commit** (после Task 8–11 пакет наполнится; коммит скаффолда сейчас)

```bash
git add packages/telemetry/package.json packages/telemetry/tsconfig.json packages/telemetry/tsconfig.build.json apps/web-client/package.json apps/web/package.json apps/web-client/Dockerfile apps/web/Dockerfile package-lock.json
git commit -m "chore(telemetry): скаффолд пакета @trener/telemetry + подключение в фронты"
```

---

## Task 8: Конфиг/сессия + очередь отправки + тест

**Files:**

- Create: `packages/telemetry/src/config.ts`, `packages/telemetry/src/queue.ts`, `packages/telemetry/src/queue.test.ts`

- [ ] **Step 1: config (синглтон конфигурации + sessionId)**

`packages/telemetry/src/config.ts`:

```ts
import type { TelemetrySource } from '@trener/shared';

export type TelemetryConfig = {
  apiBaseUrl: string; // напр. '' (тот же origin через прокси) или 'https://api...'
  source: TelemetrySource;
  appVersion?: string;
};

let cfg: TelemetryConfig | null = null;

export function setConfig(c: TelemetryConfig): void {
  cfg = c;
}
export function getConfig(): TelemetryConfig | null {
  return cfg;
}

const SESSION_KEY = 'telemetry.sid';

export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return 'no-session';
  }
}
```

- [ ] **Step 2: Падающий тест очереди**

`packages/telemetry/src/queue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeQueue } from './queue.js';

describe('makeQueue', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('батчит и шлёт через send при flush', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue<{ n: number }>({ send, maxBatch: 10, max: 100 });
    q.push({ n: 1 });
    q.push({ n: 2 });
    await q.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('flush без элементов не шлёт', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue<{ n: number }>({ send, maxBatch: 10, max: 100 });
    await q.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('кап очереди отбрасывает старые при переполнении', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue<{ n: number }>({ send, maxBatch: 10, max: 2 });
    q.push({ n: 1 });
    q.push({ n: 2 });
    q.push({ n: 3 });
    expect(q.size()).toBe(2);
  });
});
```

- [ ] **Step 3: Запустить — упадёт**

Run: `npx vitest run packages/telemetry/src/queue.test.ts`
Expected: FAIL — нет модуля.

- [ ] **Step 4: Реализация очереди**

`packages/telemetry/src/queue.ts`:

```ts
export type Queue<T> = {
  push: (item: T) => void;
  flush: () => Promise<void>;
  size: () => number;
};

export type QueueOpts<T> = {
  send: (batch: T[]) => Promise<void>;
  maxBatch: number; // максимум элементов в одной отправке
  max: number; // максимум в буфере (старые отбрасываются)
};

export function makeQueue<T>(opts: QueueOpts<T>): Queue<T> {
  let buf: T[] = [];

  return {
    push(item) {
      buf.push(item);
      if (buf.length > opts.max) buf = buf.slice(buf.length - opts.max);
    },
    async flush() {
      while (buf.length > 0) {
        const batch = buf.slice(0, opts.maxBatch);
        buf = buf.slice(opts.maxBatch);
        try {
          await opts.send(batch);
        } catch {
          // Телеметрия не должна влиять на UX — глотаем ошибки отправки.
          return;
        }
      }
    },
    size() {
      return buf.length;
    },
  };
}
```

- [ ] **Step 5: Запустить — пройдёт**

Run: `npx vitest run packages/telemetry/src/queue.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 6: Commit**

```bash
git add packages/telemetry/src/config.ts packages/telemetry/src/queue.ts packages/telemetry/src/queue.test.ts
git commit -m "feat(telemetry): конфиг/сессия и батч-очередь отправки"
```

---

## Task 9: Безопасная метка клика + тест

**Files:**

- Create: `packages/telemetry/src/clicks.ts`, `packages/telemetry/src/clicks.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/telemetry/src/clicks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clickLabel } from './clicks.js';

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild as HTMLElement;
}

describe('clickLabel', () => {
  it('берёт data-track в приоритете', () => {
    const e = el('<button data-track="save" aria-label="Сохранить">Сохранить всё</button>');
    expect(clickLabel(e)).toBe('save');
  });
  it('затем aria-label', () => {
    expect(clickLabel(el('<button aria-label="Назад">x</button>'))).toBe('Назад');
  });
  it('затем короткий текст, обрезка', () => {
    expect(clickLabel(el('<a>Открыть</a>'))).toBe('Открыть');
  });
  it('НЕ берёт значение поля ввода', () => {
    const e = el('<input value="секрет 123" />');
    expect(clickLabel(e)).toBe('input'); // только тип, без значения
  });
  it('обрезает длинный текст до 64', () => {
    const long = 'я'.repeat(200);
    expect((clickLabel(el(`<button>${long}</button>`)) ?? '').length).toBeLessThanOrEqual(64);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npx vitest run packages/telemetry/src/clicks.test.ts`
Expected: FAIL — нет модуля.

- [ ] **Step 3: Реализация**

`packages/telemetry/src/clicks.ts`:

```ts
// Безопасная метка кликнутого элемента: только обезличенное, без значений полей.
export function clickLabel(target: HTMLElement | null): string | null {
  const el = target?.closest<HTMLElement>(
    '[data-track],button,a,[role="button"],[role="tab"],input,select,textarea',
  );
  if (!el) return null;

  const track = el.getAttribute('data-track');
  if (track) return track.slice(0, 64);

  const aria = el.getAttribute('aria-label');
  if (aria) return aria.slice(0, 64);

  const tag = el.tagName.toLowerCase();
  // Поля ввода: только тип элемента, НИКОГДА значение.
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return tag;

  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 64);

  return tag;
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npx vitest run packages/telemetry/src/clicks.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**

```bash
git add packages/telemetry/src/clicks.ts packages/telemetry/src/clicks.test.ts
git commit -m "feat(telemetry): безопасное извлечение метки клика"
```

---

## Task 10: Трекер событий (track/pageView) + авто-клик + TelemetryRouter

**Files:**

- Create: `packages/telemetry/src/track.ts`, `packages/telemetry/src/TelemetryRouter.tsx`

- [ ] **Step 1: track.ts (очереди событий + flush через fetch keepalive + авто-клик)**

`packages/telemetry/src/track.ts`:

```ts
import type { AnalyticsEventInput, ClientErrorInput } from '@trener/shared';
import { getConfig, getSessionId } from './config.js';
import { makeQueue } from './queue.js';
import { clickLabel } from './clicks.js';

function postBatch(pathSuffix: 'events' | 'errors', payload: object): Promise<void> {
  const cfg = getConfig();
  if (!cfg) return Promise.resolve();
  return fetch(`${cfg.apiBaseUrl}/api/telemetry/${pathSuffix}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
    keepalive: true,
  }).then(
    () => undefined,
    () => undefined,
  );
}

const eventsQueue = makeQueue<AnalyticsEventInput>({
  maxBatch: 50,
  max: 500,
  send: (events) => {
    const cfg = getConfig();
    if (!cfg) return Promise.resolve();
    return postBatch('events', { source: cfg.source, sessionId: getSessionId(), events });
  },
});

const errorsQueue = makeQueue<ClientErrorInput>({
  maxBatch: 20,
  max: 100,
  send: (errors) => {
    const cfg = getConfig();
    if (!cfg) return Promise.resolve();
    return postBatch('errors', { source: cfg.source, sessionId: getSessionId(), errors });
  },
});

export function track(name: string, props?: Record<string, unknown>): void {
  eventsQueue.push({ name, path: location.pathname, props });
}

export function pageView(path: string): void {
  eventsQueue.push({ name: 'page_view', path });
}

export function reportError(e: ClientErrorInput): void {
  errorsQueue.push(e);
  void errorsQueue.flush();
}

let flushTimer: number | null = null;
let started = false;

// Авто-клик + периодический flush + flush на уход со страницы.
export function startAutoTracking(): void {
  if (started) return;
  started = true;

  document.addEventListener(
    'click',
    (ev) => {
      const label = clickLabel(ev.target as HTMLElement | null);
      if (label) track('click', { label });
    },
    { capture: true },
  );

  flushTimer = window.setInterval(() => void eventsQueue.flush(), 5000);

  const flushAll = () => {
    void eventsQueue.flush();
    void errorsQueue.flush();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
  window.addEventListener('pagehide', flushAll);
}

export function stopAutoTracking(): void {
  if (flushTimer !== null) window.clearInterval(flushTimer);
  flushTimer = null;
  started = false;
}
```

- [ ] **Step 2: TelemetryRouter.tsx (авто page_view на смену маршрута)**

`packages/telemetry/src/TelemetryRouter.tsx`:

```tsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pageView } from './track.js';

/** Невидимый компонент: на каждую смену пути шлёт page_view. Рендерить внутри Router. */
export function TelemetryRouter(): null {
  const location = useLocation();
  useEffect(() => {
    pageView(location.pathname);
  }, [location.pathname]);
  return null;
}
```

- [ ] **Step 3: Типы пакета**

Run: `npm run build -w @trener/telemetry`
Expected: tsc без ошибок (понадобится после index.ts; здесь допускается, если index ещё нет — проверим в Task 12). Если жалуется на отсутствие `./index`, продолжаем — сборка пакета в Task 11/12.

- [ ] **Step 4: Commit**

```bash
git add packages/telemetry/src/track.ts packages/telemetry/src/TelemetryRouter.tsx
git commit -m "feat(telemetry): трекер событий, авто-клик и page_view"
```

---

## Task 11: Перехват ошибок + ErrorBoundary + index

**Files:**

- Create: `packages/telemetry/src/errors.ts`, `packages/telemetry/src/ErrorBoundary.tsx`, `packages/telemetry/src/ErrorBoundary.test.tsx`, `packages/telemetry/src/index.ts`

- [ ] **Step 1: errors.ts (window-перехватчики)**

`packages/telemetry/src/errors.ts`:

```ts
import { reportError } from './track.js';

let installed = false;

export function installErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (ev) => {
    reportError({
      name: ev.error instanceof Error ? ev.error.name : 'Error',
      message: ev.message || 'window.onerror',
      stack: ev.error instanceof Error ? (ev.error.stack ?? null) : null,
      path: location.pathname,
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason: unknown = ev.reason;
    reportError({
      name: reason instanceof Error ? reason.name : 'UnhandledRejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? (reason.stack ?? null) : null,
      path: location.pathname,
    });
  });
}
```

- [ ] **Step 2: ErrorBoundary тест (падающий)**

`packages/telemetry/src/ErrorBoundary.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.js';
import * as track from './track.js';

function Boom(): never {
  throw new Error('render boom');
}

describe('ErrorBoundary', () => {
  it('рендерит fallback и репортит ошибку', () => {
    const spy = vi.spyOn(track, 'reportError').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Что-то пошло не так/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Запустить — упадёт**

Run: `npx vitest run packages/telemetry/src/ErrorBoundary.test.tsx`
Expected: FAIL — нет модуля.

- [ ] **Step 4: ErrorBoundary.tsx**

`packages/telemetry/src/ErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from './track.js';

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError({
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      path: location.pathname,
      context: { componentStack: (info.componentStack ?? '').slice(0, 2000) },
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              minHeight: '100dvh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 16, fontWeight: 600 }}>Что-то пошло не так</p>
            <button
              type="button"
              onClick={() => location.reload()}
              style={{ padding: '10px 16px', borderRadius: 12 }}
            >
              Перезагрузить
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 5: index.ts (публичный API пакета)**

`packages/telemetry/src/index.ts`:

```ts
import { setConfig, type TelemetryConfig } from './config.js';
import { startAutoTracking } from './track.js';
import { installErrorHandlers } from './errors.js';

export { track, pageView, reportError } from './track.js';
export { TelemetryRouter } from './TelemetryRouter.js';
export { ErrorBoundary } from './ErrorBoundary.js';
export type { TelemetryConfig } from './config.js';

/** Вызвать один раз при старте приложения. */
export function initTelemetry(config: TelemetryConfig): void {
  setConfig(config);
  startAutoTracking();
  installErrorHandlers();
}
```

- [ ] **Step 6: Запустить тест ErrorBoundary**

Run: `npx vitest run packages/telemetry/src/ErrorBoundary.test.tsx`
Expected: PASS.

> Примечание: для запуска tsx-теста нужен jsdom-проект vitest. Если у пакета нет своего
> vitest-конфига, тест подхватится корневым `vitest run` (jsdom задаётся проектами фронтов).
> Если падает по окружению — добавить в корневой `vitest.workspace`/конфиг проект для
> `packages/telemetry` с `environment: 'jsdom'` (см. как у web-client) — это часть данного шага.

- [ ] **Step 7: Сборка пакета**

Run: `npm run build -w @trener/telemetry`
Expected: создан `packages/telemetry/dist/index.js` + `.d.ts`, без ошибок.

- [ ] **Step 8: Commit**

```bash
git add packages/telemetry/src/errors.ts packages/telemetry/src/ErrorBoundary.tsx packages/telemetry/src/ErrorBoundary.test.tsx packages/telemetry/src/index.ts
git commit -m "feat(telemetry): перехват ошибок, ErrorBoundary и initTelemetry"
```

---

## Task 12: Подключение в клиентское приложение (`apps/web-client`)

**Files:**

- Modify: `apps/web-client/src/main.tsx`, `apps/web-client/src/App.tsx`

- [ ] **Step 1: main.tsx — init + ErrorBoundary вокруг App**

В `apps/web-client/src/main.tsx`:

- добавить импорт:

```ts
import { initTelemetry, ErrorBoundary } from '@trener/telemetry';
```

- перед `createRoot(...)` вызвать:

```ts
initTelemetry({ apiBaseUrl: '', source: 'client', appVersion: import.meta.env.VITE_APP_VERSION });
```

- обернуть `<App />` в `<ErrorBoundary>` (внутри `BrowserRouter`):

```tsx
<BrowserRouter>
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
  <ConnectivityBanner />
  {import.meta.env.DEV && <DevInspector />}
</BrowserRouter>
```

> `apiBaseUrl: ''` — фронт ходит к API тем же origin (прокси `/api` в dev и nginx в проде),
> как уже делает `apiFetch`. `VITE_APP_VERSION` опционален (если нет — undefined).

- [ ] **Step 2: App.tsx — TelemetryRouter внутри роутера**

В `apps/web-client/src/App.tsx` добавить импорт `import { TelemetryRouter } from '@trener/telemetry';`
и отрендерить `<TelemetryRouter />` сразу внутри возвращаемого дерева залогиненного приложения
(там, где уже есть `<Routes>` — рядом, на одном уровне, например перед `<div ...>` контейнером
или сразу внутри него). `useLocation` внутри `TelemetryRouter` требует, чтобы он был под
`BrowserRouter` (он есть из main.tsx).

Конкретно — внутри `App` (которая рендерится под BrowserRouter), добавить `<TelemetryRouter />`
первым потомком корневого `<div>` залогиненного состояния:

```tsx
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col overflow-hidden bg-bg">
      <TelemetryRouter />
      {!linked && <ConnectBanner />}
      ...
```

- [ ] **Step 3: Сборка фронта (резолв пакета + типы)**

Run: `npm run build -w @trener/web-client`
Expected: сборка проходит (Vite резолвит `@trener/telemetry` через workspace).

- [ ] **Step 4: Тест-смоук фронта**

Run: `npm run test -w @trener/web-client`
Expected: существующие тесты зелёные (если какой-то рендерит `App` без Router-контекста и
ломается на `useLocation` — обернуть в тесте в `MemoryRouter`, как уже принято в тестах).

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/main.tsx apps/web-client/src/App.tsx
git commit -m "feat(web-client): подключение телеметрии (init + page_view + ErrorBoundary)"
```

---

## Task 13: Подключение в тренерское приложение (`apps/web`)

**Files:**

- Modify: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`

- [ ] **Step 1: main.tsx**

Аналогично Task 12, но `source: 'trainer'`:

```ts
import { initTelemetry, ErrorBoundary } from '@trener/telemetry';
// ...
initTelemetry({ apiBaseUrl: '', source: 'trainer', appVersion: import.meta.env.VITE_APP_VERSION });
```

Обернуть `<App />` в `<ErrorBoundary>` внутри роутера (структуру свериться с реальным
`apps/web/src/main.tsx`; обёртка — между Router и App).

- [ ] **Step 2: App.tsx — `<TelemetryRouter />` под роутером**

Добавить `import { TelemetryRouter } from '@trener/telemetry';` и отрендерить `<TelemetryRouter />`
первым потомком корневого контейнера приложения (под BrowserRouter).

- [ ] **Step 3: Сборка**

Run: `npm run build -w @trener/web`
Expected: проходит.

- [ ] **Step 4: Тест-смоук**

Run: `npm run test -w @trener/web`
Expected: зелёно (при необходимости обернуть падающие на `useLocation` тесты в `MemoryRouter`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx apps/web/src/App.tsx
git commit -m "feat(web): подключение телеметрии (init + page_view + ErrorBoundary)"
```

---

## Task 14: Полная проверка + деплой (КОНТРОЛЛЕР)

- [ ] **Step 1: Полная проверка**

Run: `DATABASE_URL="postgres://postgres:postgres@localhost:5432/trener_test" npm run check`
Expected: format/lint/types/тесты зелёные. (При flaky-загрязнении `trener_test` —
предварительно очистить таблицы, как принято в проекте.)

- [ ] **Step 2: Сборка и деплой образов (контроллер)**

```bash
COOKIE_SECRET=$(printf 'x%.0s' {1..40}) docker compose build api web-client nginx
COOKIE_SECRET=$(printf 'x%.0s' {1..40}) docker compose up -d api web-client nginx
```

- [ ] **Step 3: Живой смоук**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8081/api/telemetry/events \
  -H 'content-type: application/json' \
  --data-binary '{"source":"client","sessionId":"smoke","events":[{"name":"page_view","path":"/"}]}'
```

Expected: `200`. Проверить строку: `SELECT * FROM analytics_events WHERE session_id='smoke';`
в боевой `trener`.

- [ ] **Step 4: Финал** — использовать superpowers:finishing-a-development-branch.

---

## Заметки (вне объёма v1)

- Авто-ретеншн (чистка `ts < now() - 90d`) — отдельной задачей (cron/SQL).
- UI-дашборд — отдельная фича.
- Группировка/дедуп ошибок, алерты — нет.
- `process.on('uncaughtException'|'unhandledRejection')` на API — nice-to-have, не в этом плане.
