# Клиентское приложение — раздел «Тренировки» (результаты). План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать клиенту read-only просмотр результатов выполненных тренером тренировок (список завершённых + деталь с факт/план и бейджем рекорда).

**Architecture:** Бэкенд — тонкий клиентский фасад `/api/client/workouts*` (`requireClient` → `resolveScope` → существующий `client-workouts` сервис, фильтр `completed`). Фронт `apps/web-client` — список (группировка по датам) + деталь, плюс чистый хелпер расчёта рекордов.

**Tech Stack:** Fastify 5, Drizzle, Postgres, Zod (`@trener/shared`), React 18, Vite, TanStack Query, react-router 6, vitest.

**Спека:** [docs/superpowers/specs/2026-06-03-web-client-workouts-results-design.md](../specs/2026-06-03-web-client-workouts-results-design.md)

**Соглашения:** команды из корня репо. Бэкенд itest требует Postgres + `DATABASE_URL` (локально docker на :5432) — без него `*.itest.ts` скипаются (это нормально для имплементера; полный прогон с БД делает контроллер). Docker/миграции имплементер не запускает. Pre-commit гоняет eslint+prettier.

---

## Карта файлов

**Бэкенд**

- Create: `apps/api/src/modules/client-app-workouts/client-app-workouts.routes.ts` — клиентские read-роуты.
- Create: `apps/api/src/modules/client-app-workouts/client-app-workouts.module.ts` — сборка фасада.
- Create: `apps/api/src/modules/client-app-workouts/client-app-workouts.isolation.itest.ts` — изоляция/доступ.
- Modify: `apps/api/src/app.ts` — захватить сервис client-auth и зарегистрировать новый модуль.

**Фронт `apps/web-client`**

- Create: `src/lib/records.ts` (+ `src/lib/records.test.ts`) — расчёт рекордных подходов.
- Create: `src/lib/workoutDates.ts` — группировка по датам + форматирование (чистые функции).
- Create: `src/api/workouts.ts` — хуки `useClientWorkouts`, `useClientWorkout`.
- Create: `src/pages/WorkoutsListPage.tsx`, `src/pages/WorkoutDetailPage.tsx`.
- Create: `src/pages/WorkoutsListPage.test.tsx` — smoke.
- Modify: `src/App.tsx` — заменить заглушку «Тренировки» на список + маршрут детали.

---

## Phase 1 — Бэкенд-фасад

### Task 1: Клиентские роуты `/api/client/workouts` + модуль + регистрация + изоляционный itest

**Files:**

- Create: `apps/api/src/modules/client-app-workouts/client-app-workouts.routes.ts`
- Create: `apps/api/src/modules/client-app-workouts/client-app-workouts.module.ts`
- Create: `apps/api/src/modules/client-app-workouts/client-app-workouts.isolation.itest.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Падающий изоляционный itest**

Create `apps/api/src/modules/client-app-workouts/client-app-workouts.isolation.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-workouts (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: FastifyInstance;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  function clientCookie(res: { cookies: { name: string; value: string }[] }): string {
    const c = res.cookies.find((ck) => ck.name === 'client_sid');
    if (!c) throw new Error('нет client_sid');
    return `client_sid=${c.value}`;
  }
  function trainerCookie(res: { cookies: { name: string; value: string }[] }): string {
    const c = res.cookies.find((ck) => ck.name === 'sid');
    if (!c) throw new Error('нет sid');
    return `sid=${c.value}`;
  }

  it('весь сценарий: завершённую видно, незавершённую/чужую — нет, без привязки — 409', async () => {
    // 1) Клиент A регистрируется в клиентском приложении.
    const regA = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'wa@b.co', password: 'longenough1', firstName: 'A', lastName: 'K' },
    });
    expect(regA.statusCode).toBe(201);
    const accAId = (regA.json() as { account: { id: string } }).account.id;
    const cookieA = clientCookie(regA);

    // 2) До привязки тренером список → 409 NOT_LINKED.
    const before = await app.inject({
      method: 'GET',
      url: '/api/client/workouts',
      headers: { cookie: cookieA },
    });
    expect(before.statusCode).toBe(409);
    expect((before.json() as { code: string }).code).toBe('NOT_LINKED');

    // 3) Тренер регистрируется и создаёт клиента, привязанного к accAId.
    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'tr@b.co', password: 'longenough1', firstName: 'T', lastName: 'R' },
    });
    const cookieT = trainerCookie(regT);
    const cli = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: { cookie: cookieT },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId: accAId },
    });
    expect(cli.statusCode).toBe(201);
    const clientId = (cli.json() as { client: { id: string } }).client.id;

    // 4) Нужно упражнение, чтобы собрать тренировку.
    const ex = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      headers: { cookie: cookieT },
      payload: { name: 'Жим', muscleGroups: ['Грудь'] },
    });
    const exerciseId = (ex.json() as { exercise: { id: string } }).exercise.id;

    // 5) Завершённая тренировка (create → start → complete).
    const wk = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/workouts`,
      headers: { cookie: cookieT },
      payload: {
        name: 'Тренировка 1',
        exercises: [{ exerciseId, sets: [{ plannedReps: 10, plannedWeightKg: 50 }] }],
      },
    });
    expect(wk.statusCode).toBe(201);
    const doneWid = (wk.json() as { workout: { id: string } }).workout.id;
    await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/workouts/${doneWid}/start`,
      headers: { cookie: cookieT },
    });
    await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/workouts/${doneWid}/complete`,
      headers: { cookie: cookieT },
      payload: {},
    });

    // 6) Незавершённая (draft) тренировка.
    const draft = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/workouts`,
      headers: { cookie: cookieT },
      payload: {
        name: 'Черновик',
        exercises: [{ exerciseId, sets: [{ plannedReps: 8 }] }],
      },
    });
    const draftWid = (draft.json() as { workout: { id: string } }).workout.id;

    // 7) Клиент A видит только завершённую.
    const list = await app.inject({
      method: 'GET',
      url: '/api/client/workouts',
      headers: { cookie: cookieA },
    });
    expect(list.statusCode).toBe(200);
    const workouts = (list.json() as { workouts: { id: string; status: string }[] }).workouts;
    expect(workouts.map((w) => w.id)).toEqual([doneWid]);
    expect(workouts.every((w) => w.status === 'completed')).toBe(true);

    // 8) Деталь завершённой — 200; деталь черновика — 404.
    const okDetail = await app.inject({
      method: 'GET',
      url: `/api/client/workouts/${doneWid}`,
      headers: { cookie: cookieA },
    });
    expect(okDetail.statusCode).toBe(200);
    const draftDetail = await app.inject({
      method: 'GET',
      url: `/api/client/workouts/${draftWid}`,
      headers: { cookie: cookieA },
    });
    expect(draftDetail.statusCode).toBe(404);

    // 9) Клиент B не видит тренировки клиента A.
    const regB = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'wb@b.co', password: 'longenough1', firstName: 'B', lastName: 'K' },
    });
    const accBId = (regB.json() as { account: { id: string } }).account.id;
    const cookieB = clientCookie(regB);
    const cliB = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: { cookie: cookieT },
      payload: { firstName: 'Би', lastName: 'Би', accountId: accBId },
    });
    expect(cliB.statusCode).toBe(201);
    const listB = await app.inject({
      method: 'GET',
      url: '/api/client/workouts',
      headers: { cookie: cookieB },
    });
    expect((listB.json() as { workouts: unknown[] }).workouts).toEqual([]);
    const crossDetail = await app.inject({
      method: 'GET',
      url: `/api/client/workouts/${doneWid}`,
      headers: { cookie: cookieB },
    });
    expect(crossDetail.statusCode).toBe(404);
  });

  it('без сессии → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/workouts' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Запустить — упасть**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-app-workouts.isolation
```

Expected: FAIL — нет роутов (404 на /api/client/workouts) или модуль не зарегистрирован. (Без `DATABASE_URL` тест skipped — тогда упасть он не сможет; имплементер при отсутствии БД переходит к реализации, контроллер прогонит с БД.)

- [ ] **Step 3: Реализовать роуты**

Create `apps/api/src/modules/client-app-workouts/client-app-workouts.routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { workoutResponseSchema, workoutListResponseSchema, type ClientLink } from '@trener/shared';
import type { ClientWorkoutsService } from '../client-workouts/client-workouts.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { AppError, notFound, unauthorized } from '../../errors.js';

type ResolveScope = (clientAccountId: string) => Promise<ClientLink>;

const widParams = z.object({ wid: z.string() });
const workoutWrap = z.object({ workout: workoutResponseSchema });

export function clientAppWorkoutsRoutes(
  app: FastifyInstance,
  svc: ClientWorkoutsService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Скоуп клиента из сессии: нет аккаунта → 401, нет привязки → 409 NOT_LINKED.
  async function scope(req: FastifyRequest): Promise<{ trainerId: string; clientId: string }> {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    const link = await resolveScope(req.clientAccountId);
    if (!link) throw new AppError(409, 'NOT_LINKED', 'Аккаунт не подключён к тренеру');
    return link;
  }

  typed.get(
    '/api/client/workouts',
    { preHandler: requireClient, schema: { response: { 200: workoutListResponseSchema } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const all = await svc.list(trainerId, clientId);
      const workouts = all
        .filter((w) => w.status === 'completed')
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      return { workouts };
    },
  );

  typed.get(
    '/api/client/workouts/:wid',
    { preHandler: requireClient, schema: { params: widParams, response: { 200: workoutWrap } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const workout = await svc.get(trainerId, clientId, req.params.wid);
      // Клиент не видит незавершённые («во время не видит»).
      if (workout.status !== 'completed') throw notFound('Тренировка не найдена');
      return { workout };
    },
  );
}
```

- [ ] **Step 4: Реализовать модуль**

Create `apps/api/src/modules/client-app-workouts/client-app-workouts.module.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeClientWorkoutsRepo } from '../client-workouts/client-workouts.repo.js';
import { makeClientWorkoutsService } from '../client-workouts/client-workouts.service.js';
import { clientAppWorkoutsRoutes } from './client-app-workouts.routes.js';

// Клиентский фасад над доменным client-workouts: переиспользует сервис, скоуп
// берётся из сессии через resolveScope (из client-auth). Свой repo не заводим.
export function registerClientAppWorkoutsModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makeClientWorkoutsService(makeClientWorkoutsRepo(deps.db), {
    newId: deps.clock.newId,
    now: deps.clock.now,
  });
  clientAppWorkoutsRoutes(app, svc, deps.resolveScope);
}
```

- [ ] **Step 5: Зарегистрировать в composition root**

Modify `apps/api/src/app.ts`:

(а) импорт после `import { registerClientAuthModule } from './modules/client-auth/client-auth.module.js';`:

```ts
import { registerClientAppWorkoutsModule } from './modules/client-app-workouts/client-app-workouts.module.js';
```

(б) захватить сервис client-auth: заменить строку

```ts
await registerClientAuthModule(app, { db: deps.db, clock, isProd: deps.isProd });
```

на

```ts
const clientAuthSvc = await registerClientAuthModule(app, {
  db: deps.db,
  clock,
  isProd: deps.isProd,
});
registerClientAppWorkoutsModule(app, {
  db: deps.db,
  clock,
  resolveScope: (id) => clientAuthSvc.resolveScope(id),
});
```

(Порядок важен: `registerClientAuthModule` навешивает глобальный `clientContext` (fp), поэтому новый модуль, регистрируемый ниже, видит `req.clientAccountId`.)

- [ ] **Step 6: Запустить — пройти + типы**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-app-workouts.isolation
```

Expected: PASS (2 теста). Затем `npm run typecheck` — без ошибок.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/client-app-workouts apps/api/src/app.ts
git commit -m "feat(api): клиентский фасад /api/client/workouts (результаты, read-only)"
```

---

## Phase 2 — Фронт: чистые хелперы

### Task 2: Хелпер расчёта рекордных подходов

**Files:**

- Create: `apps/web-client/src/lib/records.ts`
- Test: `apps/web-client/src/lib/records.test.ts`

- [ ] **Step 1: Падающий тест**

Create `apps/web-client/src/lib/records.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { WorkoutResponse } from '@trener/shared';
import { computeRecordKeys, setKey } from './records';

function wk(id: string, sets: { w: number | null; r: number | null }[]): WorkoutResponse {
  return {
    id,
    clientId: 'c1',
    name: 'W',
    status: 'completed',
    startedAt: null,
    completedAt: null,
    durationSec: null,
    trainerNote: null,
    rpe: null,
    exercises: [
      {
        position: 0,
        exerciseId: 'ex1',
        exerciseName: 'Жим',
        sets: sets.map((s, i) => ({
          setIndex: i,
          plannedReps: null,
          plannedWeightKg: null,
          plannedTimeSec: null,
          plannedRestSec: null,
          actualReps: s.r,
          actualWeightKg: s.w,
          actualTimeSec: null,
          done: true,
        })),
      },
    ],
  };
}

describe('computeRecordKeys', () => {
  it('помечает подход с максимальным весом по упражнению', () => {
    const keys = computeRecordKeys([wk('w1', [{ w: 50, r: 10 }]), wk('w2', [{ w: 60, r: 8 }])]);
    expect(keys.has(setKey('w2', 0, 0))).toBe(true);
    expect(keys.has(setKey('w1', 0, 0))).toBe(false);
  });

  it('при равном весе рекорд — больший по повторам', () => {
    const keys = computeRecordKeys([
      wk('w1', [
        { w: 50, r: 10 },
        { w: 50, r: 12 },
      ]),
    ]);
    expect(keys.has(setKey('w1', 0, 1))).toBe(true);
    expect(keys.has(setKey('w1', 0, 0))).toBe(false);
  });

  it('подходы без факта не дают рекорда', () => {
    const keys = computeRecordKeys([wk('w1', [{ w: null, r: null }])]);
    expect(keys.size).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить — упасть**

Run: `npm run test -w @trener/web-client -- records`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

Create `apps/web-client/src/lib/records.ts`:

```ts
import type { WorkoutResponse } from '@trener/shared';

/** Стабильный ключ подхода для пометки рекордов. */
export function setKey(workoutId: string, position: number, setIndex: number): string {
  return `${workoutId}:${position}:${setIndex}`;
}

type Best = { key: string; weight: number; reps: number; time: number };

/**
 * По всем завершённым тренировкам находит «рекордный» подход каждого упражнения:
 * максимум по весу, при равенстве — по повторам, затем по времени. Подходы без
 * фактических значений игнорируются. Возвращает множество ключей-рекордов.
 */
export function computeRecordKeys(workouts: WorkoutResponse[]): Set<string> {
  const bestByExercise = new Map<string, Best>();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        const weight = s.actualWeightKg;
        const reps = s.actualReps;
        const time = s.actualTimeSec;
        if (weight === null && reps === null && time === null) continue;
        const cand: Best = {
          key: setKey(w.id, ex.position, s.setIndex),
          weight: weight ?? 0,
          reps: reps ?? 0,
          time: time ?? 0,
        };
        const cur = bestByExercise.get(ex.exerciseId);
        if (
          !cur ||
          cand.weight > cur.weight ||
          (cand.weight === cur.weight && cand.reps > cur.reps) ||
          (cand.weight === cur.weight && cand.reps === cur.reps && cand.time > cur.time)
        ) {
          bestByExercise.set(ex.exerciseId, cand);
        }
      }
    }
  }
  return new Set([...bestByExercise.values()].map((b) => b.key));
}
```

- [ ] **Step 4: Запустить — пройти**

Run: `npm run test -w @trener/web-client -- records`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/lib/records.ts apps/web-client/src/lib/records.test.ts
git commit -m "feat(web-client): хелпер расчёта рекордных подходов"
```

---

### Task 3: Хелпер группировки по датам

**Files:**

- Create: `apps/web-client/src/lib/workoutDates.ts`
- Test: `apps/web-client/src/lib/workoutDates.test.ts`

- [ ] **Step 1: Падающий тест**

Create `apps/web-client/src/lib/workoutDates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatDateGroup, formatTime } from './workoutDates';

const now = new Date('2026-06-03T12:00:00Z');

describe('formatDateGroup', () => {
  it('сегодня', () => {
    expect(formatDateGroup('2026-06-03T08:30:00Z', now)).toBe('Сегодня');
  });
  it('вчера', () => {
    expect(formatDateGroup('2026-06-02T20:00:00Z', now)).toBe('Вчера');
  });
  it('иначе — день и месяц', () => {
    expect(formatDateGroup('2026-05-28T09:00:00Z', now)).toBe('28 мая');
  });
});

describe('formatTime', () => {
  it('часы:минуты', () => {
    expect(/^\d{2}:\d{2}$/.test(formatTime('2026-06-03T08:30:00Z'))).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — упасть**

Run: `npm run test -w @trener/web-client -- workoutDates`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

Create `apps/web-client/src/lib/workoutDates.ts`:

```ts
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Заголовок группы: «Сегодня» / «Вчера» / «28 мая» (по локальному времени). */
export function formatDateGroup(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const today = ymd(now);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (ymd(d) === today) return 'Сегодня';
  if (ymd(d) === ymd(yest)) return 'Вчера';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Время ЧЧ:ММ по локали ru. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
```

- [ ] **Step 4: Запустить — пройти**

Run: `npm run test -w @trener/web-client -- workoutDates`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/lib/workoutDates.ts apps/web-client/src/lib/workoutDates.test.ts
git commit -m "feat(web-client): группировка тренировок по датам"
```

---

## Phase 3 — Фронт: данные и экраны

### Task 4: API-хуки тренировок

**Files:**

- Create: `apps/web-client/src/api/workouts.ts`

- [ ] **Step 1: Реализовать хуки**

Create `apps/web-client/src/api/workouts.ts`:

```ts
import {
  workoutListResponseSchema,
  workoutResponseSchema,
  type WorkoutResponse,
} from '@trener/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './client';

const workoutWrap = z.object({ workout: workoutResponseSchema });

export const clientWorkoutsQueryKey = ['client', 'workouts'] as const;
export const clientWorkoutQueryKey = (wid: string) => ['client', 'workouts', wid] as const;

/** Завершённые тренировки клиента (read-only результаты). */
export function useClientWorkouts() {
  return useQuery<WorkoutResponse[]>({
    queryKey: clientWorkoutsQueryKey,
    queryFn: () =>
      apiFetch('/client/workouts', { schema: workoutListResponseSchema }).then((r) => r.workouts),
  });
}

/** Деталь завершённой тренировки. */
export function useClientWorkout(wid: string) {
  return useQuery<WorkoutResponse>({
    queryKey: clientWorkoutQueryKey(wid),
    queryFn: () =>
      apiFetch(`/client/workouts/${wid}`, { schema: workoutWrap }).then((r) => r.workout),
    enabled: wid !== '',
  });
}
```

- [ ] **Step 2: Проверить типы (изолированно)**

Run: `npx tsc --noEmit -p apps/web-client/tsconfig.app.json`
Expected: единственная возможная ошибка — на ещё не созданные страницы, если их кто-то импортирует; сам `api/workouts.ts` без ошибок. (Если App.tsx ещё не трогали — ошибок быть не должно.)

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/api/workouts.ts
git commit -m "feat(web-client): api-хуки тренировок (список, деталь)"
```

---

### Task 5: Экран списка тренировок + маршрут + smoke

**Files:**

- Create: `apps/web-client/src/pages/WorkoutsListPage.tsx`
- Create: `apps/web-client/src/pages/WorkoutsListPage.test.tsx`
- Modify: `apps/web-client/src/App.tsx`

- [ ] **Step 1: Реализовать экран списка**

Create `apps/web-client/src/pages/WorkoutsListPage.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { WorkoutResponse } from '@trener/shared';
import { useClientWorkouts } from '../api/workouts';
import { formatDateGroup, formatTime } from '../lib/workoutDates';

function groupByDate(workouts: WorkoutResponse[]): { label: string; items: WorkoutResponse[] }[] {
  const groups: { label: string; items: WorkoutResponse[] }[] = [];
  for (const w of workouts) {
    const label = w.completedAt ? formatDateGroup(w.completedAt) : 'Без даты';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(w);
    else groups.push({ label, items: [w] });
  }
  return groups;
}

export function WorkoutsListPage() {
  const q = useClientWorkouts();

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] text-ink">Тренировки</h1>

      {q.isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
      {q.isError && (
        <p className="text-sm text-ink-muted">Не удалось загрузить. Потяните обновить.</p>
      )}
      {q.data && q.data.length === 0 && (
        <p className="text-sm text-ink-muted">Пока нет завершённых тренировок.</p>
      )}

      {q.data &&
        groupByDate(q.data).map((g) => (
          <section key={g.label} className="flex flex-col gap-2">
            <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
              {g.label}
            </h2>
            {g.items.map((w) => (
              <Link
                key={w.id}
                to={`/workouts/${w.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 active:bg-card-elevated"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold text-ink">{w.name}</span>
                  <span className="text-[12px] text-ink-muted">
                    {w.completedAt ? formatTime(w.completedAt) : ''}
                    {' · '}
                    {w.exercises.length} упр.
                    {w.durationSec ? ` · ${Math.round(w.durationSec / 60)} мин` : ''}
                    {w.rpe ? ` · RPE ${w.rpe}` : ''}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-mutedxl" />
              </Link>
            ))}
          </section>
        ))}
    </div>
  );
}
```

- [ ] **Step 2: Подключить маршрут в App.tsx**

Modify `apps/web-client/src/App.tsx`:

(а) импорт: добавить после `import { StubPage } from './pages/StubPage';`:

```tsx
import { WorkoutsListPage } from './pages/WorkoutsListPage';
import { WorkoutDetailPage } from './pages/WorkoutDetailPage';
```

(б) в основном shell заменить строку

```tsx
<Route path="/" element={<StubPage title="Тренировки" />} />
```

на

```tsx
        <Route path="/" element={<WorkoutsListPage />} />
        <Route path="/workouts/:wid" element={<WorkoutDetailPage />} />
```

(Импорт `WorkoutDetailPage` будет резолвиться после Task 6 — файл создаётся там. Если выполняешь Task 5 раньше Task 6, временно создай заглушку или выполняй Task 6 перед сборкой. Рекомендуется делать Task 5 и Task 6 подряд, сборку гонять после Task 6.)

- [ ] **Step 3: Smoke-тест списка**

Create `apps/web-client/src/pages/WorkoutsListPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkoutsListPage } from './WorkoutsListPage';
import * as api from '../api/workouts';

vi.mock('../api/workouts');

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkoutsListPage />
    </MemoryRouter>,
  );
}

describe('WorkoutsListPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('пустое состояние', () => {
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    renderPage();
    expect(screen.getByText('Пока нет завершённых тренировок.')).toBeInTheDocument();
  });

  it('показывает карточку тренировки', () => {
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: 'w1',
          clientId: 'c1',
          name: 'Грудь+трицепс',
          status: 'completed',
          startedAt: null,
          completedAt: '2026-06-03T08:30:00Z',
          durationSec: 3600,
          trainerNote: null,
          rpe: 7,
          exercises: [{ position: 0, exerciseId: 'e1', exerciseName: 'Жим', sets: [] }],
        },
      ],
    } as never);
    renderPage();
    expect(screen.getByText('Грудь+трицепс')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Прогон тестов списка**

Run: `npm run test -w @trener/web-client -- WorkoutsListPage`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/pages/WorkoutsListPage.tsx apps/web-client/src/pages/WorkoutsListPage.test.tsx apps/web-client/src/App.tsx
git commit -m "feat(web-client): экран списка тренировок (результаты)"
```

---

### Task 6: Экран детали тренировки

**Files:**

- Create: `apps/web-client/src/pages/WorkoutDetailPage.tsx`

- [ ] **Step 1: Реализовать экран детали**

Create `apps/web-client/src/pages/WorkoutDetailPage.tsx`:

```tsx
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { WorkoutResponse, WorkoutSetResponse } from '@trener/shared';
import { useClientWorkout, useClientWorkouts } from '../api/workouts';
import { computeRecordKeys, setKey } from '../lib/records';
import { formatDateGroup } from '../lib/workoutDates';

function factText(s: WorkoutSetResponse): string {
  if (s.actualTimeSec !== null) return `${s.actualTimeSec} сек`;
  if (s.actualReps !== null || s.actualWeightKg !== null) {
    const reps = s.actualReps ?? '—';
    const kg = s.actualWeightKg !== null ? ` × ${s.actualWeightKg} кг` : '';
    return `${reps}${kg}`;
  }
  return '—';
}

function planText(s: WorkoutSetResponse): string {
  if (s.plannedTimeSec !== null) return `план ${s.plannedTimeSec} сек`;
  const reps = s.plannedReps ?? '—';
  const kg = s.plannedWeightKg !== null ? ` × ${s.plannedWeightKg} кг` : '';
  return `план ${reps}${kg}`;
}

export function WorkoutDetailPage() {
  const { wid = '' } = useParams<{ wid: string }>();
  const q = useClientWorkout(wid);
  const list = useClientWorkouts();
  const recordKeys = computeRecordKeys(list.data ?? []);

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-4">
      <Link to="/" className="flex items-center gap-1 text-[14px] font-medium text-ink-muted">
        <ChevronLeft size={18} /> Тренировки
      </Link>

      {q.isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
      {q.isError && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Тренировка не найдена.</p>
          <Link to="/" className="text-sm font-medium text-accent">
            К списку
          </Link>
        </div>
      )}

      {q.data && <WorkoutBody w={q.data} recordKeys={recordKeys} />}
    </div>
  );
}

function WorkoutBody({ w, recordKeys }: { w: WorkoutResponse; recordKeys: Set<string> }) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">{w.name}</h1>
        <p className="text-[12px] text-ink-muted">
          {w.completedAt ? formatDateGroup(w.completedAt) : ''}
          {w.durationSec ? ` · ${Math.round(w.durationSec / 60)} мин` : ''}
          {w.rpe ? ` · RPE ${w.rpe}` : ''}
        </p>
        {w.trainerNote && (
          <p className="mt-1 rounded-xl bg-card px-3 py-2 text-[13px] text-ink-muted">
            {w.trainerNote}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3">
        {w.exercises.map((ex) => (
          <section key={ex.position} className="rounded-2xl bg-card p-4">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">{ex.exerciseName}</h2>
            <ul className="flex flex-col gap-1.5">
              {ex.sets.map((s) => {
                const isRecord = recordKeys.has(setKey(w.id, ex.position, s.setIndex));
                return (
                  <li
                    key={s.setIndex}
                    className="flex items-center justify-between gap-3 text-[14px]"
                  >
                    <span className="flex items-center gap-2 text-ink">
                      {factText(s)}
                      {isRecord && (
                        <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-on">
                          рекорд
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] text-ink-mutedxl">{planText(s)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Сборка + типы web-client**

Run: `npm run build -w @trener/web-client`
Expected: успешная сборка (tsc + vite), `dist` создан. (Теперь все импорты App.tsx разрешаются.)

- [ ] **Step 3: Smoke-тест детали**

Create `apps/web-client/src/pages/WorkoutDetailPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { WorkoutDetailPage } from './WorkoutDetailPage';
import * as api from '../api/workouts';

vi.mock('../api/workouts');

const workout = {
  id: 'w2',
  clientId: 'c1',
  name: 'Ноги',
  status: 'completed',
  startedAt: null,
  completedAt: '2026-06-03T08:30:00Z',
  durationSec: 1800,
  trainerNote: 'Хорошая работа',
  rpe: 8,
  exercises: [
    {
      position: 0,
      exerciseId: 'e1',
      exerciseName: 'Присед',
      sets: [
        {
          setIndex: 0,
          plannedReps: 10,
          plannedWeightKg: 80,
          plannedTimeSec: null,
          plannedRestSec: null,
          actualReps: 10,
          actualWeightKg: 90,
          actualTimeSec: null,
          done: true,
        },
      ],
    },
  ],
};

function renderAt() {
  return render(
    <MemoryRouter initialEntries={['/workouts/w2']}>
      <Routes>
        <Route path="/workouts/:wid" element={<WorkoutDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WorkoutDetailPage', () => {
  beforeEach(() => {
    vi.mocked(api.useClientWorkout).mockReturnValue({
      isLoading: false,
      isError: false,
      data: workout,
    } as never);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [workout],
    } as never);
  });

  it('показывает упражнение, факт и бейдж рекорда', () => {
    renderAt();
    expect(screen.getByText('Присед')).toBeInTheDocument();
    expect(screen.getByText('10 × 90 кг')).toBeInTheDocument();
    expect(screen.getByText('рекорд')).toBeInTheDocument();
    expect(screen.getByText('Хорошая работа')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Прогон тестов детали + полный web-client**

Run: `npm run test -w @trener/web-client`
Expected: все тесты web-client зелёные (records, workoutDates, WorkoutsListPage, WorkoutDetailPage, App gate).

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/pages/WorkoutDetailPage.tsx apps/web-client/src/pages/WorkoutDetailPage.test.tsx
git commit -m "feat(web-client): экран детали тренировки (факт/план, рекорд)"
```

---

## Финальная проверка

- [ ] **Гейт качества**

Run: `npm run check`
Expected: format + lint + typecheck + test зелёные (itest скипнут без `DATABASE_URL`).

- [ ] **Прогон с БД (контроллер)**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test
```

Expected: включая `client-app-workouts.isolation` — всё зелёное.

- [ ] **Живой smoke (контроллер):** пересобрать `api` + `web-client` образы, поднять; тренер создаёт+завершает тренировку клиенту; клиент в `:8081` видит её в «Тренировки», открывает деталь (факт/план, рекорд).

---

## Self-review (выполнено при написании)

- **Покрытие спеки:** фасад `/api/client/workouts` (Task 1), фильтр completed + сортировка (Task 1 routes), 404 на незавершённую/чужую + 409/401 (Task 1 itest), бейдж рекорда (Task 2), группировка по датам (Task 3), хуки (Task 4), список (Task 5), деталь с факт/план (Task 6). Вне объёма (свои тренировки, календарь, графики, «Повторить») — не реализуется, отражено в спеке.
- **Типы согласованы:** `resolveScope: (id)=>Promise<ClientLink>` в routes/module/app.ts; `WorkoutResponse`/`WorkoutSetResponse` из shared; `computeRecordKeys`/`setKey` едины в records.ts, тесте и детали; `useClientWorkouts`/`useClientWorkout` едины в api и страницах.
- **Плейсхолдеров нет:** каждый шаг — полный код/команда/ожидание. Замечание о порядке Task 5/6 (App импортирует деталь) явно проговорено.
