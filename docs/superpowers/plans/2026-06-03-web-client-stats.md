# Статистика клиентского приложения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Клиент видит свою тренировочную и телесную статистику в том же экране, что и тренер (2 таба: Упражнения, Замеры), и сам ведёт свои замеры (CRUD).

**Architecture:** Бэкенд — новый фасад `client-app-measurements` (CRUD) поверх существующего доменного сервиса `measurements` по паттерну `makeClientScope`; тренировки берём из существующего `client-app-workouts`. Фронт — порт `workout-stats.ts` + `LineChart` + `HoldToDelete` + клиентские хуки замеров + экран `StatsPage` (зеркало тренерского `ClientStatsPage` без таба «Фото» и без `clientId` из URL).

**Tech Stack:** Fastify 5 + Drizzle + Postgres; React 18 + Vite + Tailwind v4 + TanStack Query 5; Zod-контракты в `@trener/shared`.

**Спека:** `docs/superpowers/specs/2026-06-03-web-client-stats-design.md`.

---

## Соглашения по тестам

- Unit-тесты гоняются всегда (`npm run check`).
- `*.itest.ts` — **только** против `trener_test` (их `beforeAll` стирает таблицы). Запуск — **контроллер**, не сабагент.
- Сабагент пишет код, гоняет `npm run typecheck`/unit, НЕ трогает docker/БД/миграции.
- Окружение — Windows PowerShell; для bash-команд использовать Bash tool.
- Коммиты — Conventional Commits, без `--no-verify`. ⚠️ commitlint: subject не должен начинаться с аббревиатуры в верхнем регистре (не «API…», не «SQL…»).

---

## File Structure

- **Создаю:** `apps/api/src/modules/client-app-measurements/client-app-measurements.routes.ts`.
- **Создаю:** `apps/api/src/modules/client-app-measurements/client-app-measurements.module.ts`.
- **Создаю:** `apps/api/src/modules/client-app-measurements/client-app-measurements.isolation.itest.ts`.
- **Изменяю:** `apps/api/src/app.ts` (регистрация фасада).
- **Создаю:** `apps/web-client/src/lib/workout-stats.ts` (порт).
- **Создаю:** `apps/web-client/src/lib/workout-stats.test.ts` (порт).
- **Создаю:** `apps/web-client/src/components/LineChart.tsx` (порт).
- **Создаю:** `apps/web-client/src/components/HoldToDelete.tsx` (порт).
- **Создаю:** `apps/web-client/src/api/measurements.ts` (клиентские хуки).
- **Создаю:** `apps/web-client/src/pages/StatsPage.tsx` (порт экрана, 2 таба).
- **Изменяю:** `apps/web-client/src/App.tsx` (маршрут `/progress` → StatsPage).

Тренерский код не трогаем.

---

## Task 1: Фасад `client-app-measurements` (CRUD + регистрация + isolation itest)

**Files:**

- Create: `apps/api/src/modules/client-app-measurements/client-app-measurements.routes.ts`
- Create: `apps/api/src/modules/client-app-measurements/client-app-measurements.module.ts`
- Create: `apps/api/src/modules/client-app-measurements/client-app-measurements.isolation.itest.ts`
- Modify: `apps/api/src/app.ts`

Контекст: доменный сервис `measurements` (`apps/api/src/modules/measurements/measurements.service.ts`) уже имеет методы `list(trainerId, clientId)`, `create(trainerId, clientId, data)`, `update(trainerId, clientId, mid, patch)`, `remove(trainerId, clientId, mid)`, `get(...)`. Скоуп замеров (trainerId+clientId+mid) в repo даёт `notFound` (404) на чужое. Образец фасада — `apps/api/src/modules/client-app-chat/`. Хелпер `makeClientScope` — `apps/api/src/core/client-scope.ts` (401 без аккаунта, 409 NOT_LINKED).

- [ ] **Step 1: Роуты фасада**

Создать `client-app-measurements.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createMeasurementRequestSchema,
  updateMeasurementRequestSchema,
  measurementResponseSchema,
  measurementListResponseSchema,
} from '@trener/shared';
import type { MeasurementsService } from '../measurements/measurements.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

const midParams = z.object({ mid: z.string().min(1) });
const measurementWrap = z.object({ measurement: measurementResponseSchema });
const okResponse = z.object({ ok: z.literal(true) });

export function clientAppMeasurementsRoutes(
  app: FastifyInstance,
  svc: MeasurementsService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/measurements',
    { preHandler: requireClient, schema: { response: { 200: measurementListResponseSchema } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { measurements: await svc.list(trainerId, clientId) };
    },
  );

  typed.post(
    '/api/client/measurements',
    {
      preHandler: requireClient,
      schema: { body: createMeasurementRequestSchema, response: { 201: measurementWrap } },
    },
    async (req, reply) => {
      const { trainerId, clientId } = await scope(req);
      const measurement = await svc.create(trainerId, clientId, req.body);
      void reply.status(201);
      return { measurement };
    },
  );

  typed.patch(
    '/api/client/measurements/:mid',
    {
      preHandler: requireClient,
      schema: {
        params: midParams,
        body: updateMeasurementRequestSchema,
        response: { 200: measurementWrap },
      },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { measurement: await svc.update(trainerId, clientId, req.params.mid, req.body) };
    },
  );

  typed.delete(
    '/api/client/measurements/:mid',
    {
      preHandler: requireClient,
      schema: { params: midParams, response: { 200: okResponse } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      await svc.remove(trainerId, clientId, req.params.mid);
      return { ok: true as const };
    },
  );
}
```

- [ ] **Step 2: Модуль фасада**

Создать `client-app-measurements.module.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeMeasurementsRepo } from '../measurements/measurements.repo.js';
import { makeMeasurementsService } from '../measurements/measurements.service.js';
import { clientAppMeasurementsRoutes } from './client-app-measurements.routes.js';

export function registerClientAppMeasurementsModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makeMeasurementsService(makeMeasurementsRepo(deps.db), { newId: deps.clock.newId });
  clientAppMeasurementsRoutes(app, svc, deps.resolveScope);
}
```

- [ ] **Step 3: Зарегистрировать в `app.ts`**

В `apps/api/src/app.ts` добавить импорт рядом с другими `client-app-*` (после строки с `registerClientAppCalendarModule`):

```ts
import { registerClientAppMeasurementsModule } from './modules/client-app-measurements/client-app-measurements.module.js';
```

И регистрацию после `registerClientAppCalendarModule(...)`:

```ts
registerClientAppMeasurementsModule(app, {
  db: deps.db,
  clock,
  resolveScope: (id) => clientAuthSvc.resolveScope(id),
});
```

- [ ] **Step 4: Прогнать типы**

Run: `npm run typecheck -w apps/api`
Expected: PASS.

- [ ] **Step 5: Isolation itest (исполняет контроллер против trener_test)**

Создать `client-app-measurements.isolation.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-measurements (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM measurements`);
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

  function clientSid(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'client_sid');
    if (!c) throw new Error('нет client_sid');
    return c.value;
  }
  function trainerSid(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'sid');
    if (!c) throw new Error('нет sid');
    return c.value;
  }

  it('без client_sid → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/measurements' });
    expect(res.statusCode).toBe(401);
  });

  it('непривязанный клиент → 409', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'm-unl@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/client/measurements',
      cookies: { client_sid: clientSid(reg) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('клиент ведёт свои замеры; чужой замер недоступен (404)', async () => {
    // Клиент A
    const regA = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'm-a@b.co', password: 'longenough1', firstName: 'А', lastName: 'А' },
    });
    const accA = regA.json<{ account: { id: string } }>().account.id;
    const sidA = clientSid(regA);

    // Тренер + два клиента (A привязан к аккаунту, B — чужой)
    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'm-t@b.co', password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const tSid = trainerSid(regT);
    const cliA = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'А', accountId: accA },
    });
    const clientAId = cliA.json<{ client: { id: string } }>().client.id;
    const cliB = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Б' },
    });
    const clientBId = cliB.json<{ client: { id: string } }>().client.id;

    // Замер клиента B создаёт тренер
    const mB = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientBId}/measurements`,
      cookies: { sid: tSid },
      payload: { date: '2026-05-01', weightKg: 80 },
    });
    const mBId = mB.json<{ measurement: { id: string } }>().measurement.id;

    // Клиент A создаёт свой замер
    const created = await app.inject({
      method: 'POST',
      url: '/api/client/measurements',
      cookies: { client_sid: sidA },
      payload: { date: '2026-05-02', weightKg: 70, waistCm: 80 },
    });
    expect(created.statusCode).toBe(201);
    const mAId = created.json<{ measurement: { id: string } }>().measurement.id;

    // Список клиента A — только его замер
    const list = await app.inject({
      method: 'GET',
      url: '/api/client/measurements',
      cookies: { client_sid: sidA },
    });
    expect(list.statusCode).toBe(200);
    const ids = list.json<{ measurements: { id: string }[] }>().measurements.map((m) => m.id);
    expect(ids).toEqual([mAId]);

    // Правка своего — ок
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/client/measurements/${mAId}`,
      cookies: { client_sid: sidA },
      payload: { weightKg: 69 },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<{ measurement: { weightKg: number } }>().measurement.weightKg).toBe(69);

    // Правка чужого (B) → 404
    const forbidden = await app.inject({
      method: 'PATCH',
      url: `/api/client/measurements/${mBId}`,
      cookies: { client_sid: sidA },
      payload: { weightKg: 1 },
    });
    expect(forbidden.statusCode).toBe(404);

    // Удаление чужого (B) → 404
    const delForbidden = await app.inject({
      method: 'DELETE',
      url: `/api/client/measurements/${mBId}`,
      cookies: { client_sid: sidA },
    });
    expect(delForbidden.statusCode).toBe(404);

    // Удаление своего — ок
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/client/measurements/${mAId}`,
      cookies: { client_sid: sidA },
    });
    expect(del.statusCode).toBe(200);
  });
});
```

- [ ] **Step 6: Прогон itest (контроллер)**

Run (контроллер): `DATABASE_URL=postgres://postgres:postgres@localhost:5432/trener_test npx vitest run apps/api/src/modules/client-app-measurements/client-app-measurements.isolation.itest.ts`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/client-app-measurements/ apps/api/src/app.ts
git commit -m "feat(api): фасад client-app-measurements (замеры клиента, CRUD)"
```

---

## Task 2: Фронт — порт переиспользуемого (workout-stats, LineChart, HoldToDelete)

**Files:**

- Create: `apps/web-client/src/lib/workout-stats.ts`
- Create: `apps/web-client/src/lib/workout-stats.test.ts`
- Create: `apps/web-client/src/components/LineChart.tsx`
- Create: `apps/web-client/src/components/HoldToDelete.tsx`

- [ ] **Step 1: Скопировать файлы из тренерского приложения БЕЗ изменений**

Скопировать точное содержимое (зависимости проверены — только `@trener/shared` типы и `react`/`lucide-react`, всё уже есть в web-client):

- `apps/web/src/lib/workout-stats.ts` → `apps/web-client/src/lib/workout-stats.ts`
- `apps/web/src/lib/workout-stats.test.ts` → `apps/web-client/src/lib/workout-stats.test.ts`
- `apps/web/src/components/LineChart.tsx` → `apps/web-client/src/components/LineChart.tsx`
- `apps/web/src/components/HoldToDelete.tsx` → `apps/web-client/src/components/HoldToDelete.tsx`

Если в тестовом файле относительные импорты — оставить как есть (`./workout-stats`).

- [ ] **Step 2: Прогнать типы и unit-тесты web-client**

Run: `npm run typecheck -w apps/web-client && npm run test -w apps/web-client -- workout-stats`
Expected: PASS (тест портированных агрегаций зелёный).

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/lib/workout-stats.ts apps/web-client/src/lib/workout-stats.test.ts apps/web-client/src/components/LineChart.tsx apps/web-client/src/components/HoldToDelete.tsx
git commit -m "chore(web-client): порт workout-stats, LineChart, HoldToDelete"
```

---

## Task 3: Фронт — клиентские хуки замеров

**Files:**

- Create: `apps/web-client/src/api/measurements.ts`

Контекст: образец стиля — `apps/web-client/src/api/workouts.ts` (409→[] через `ApiError`) и `apps/web-client/src/api/chat.ts` (мутации с `body`). `apiFetch(path, { method, body, schema })` — из `apps/web-client/src/api/client.ts`.

- [ ] **Step 1: Хуки списка и CRUD замеров**

Создать `apps/web-client/src/api/measurements.ts`:

```ts
import {
  createMeasurementRequestSchema,
  updateMeasurementRequestSchema,
  measurementResponseSchema,
  measurementListResponseSchema,
  type MeasurementResponse,
  type CreateMeasurementRequest,
  type UpdateMeasurementRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const measurementWrap = z.object({ measurement: measurementResponseSchema });
const okWrap = z.object({ ok: z.boolean() });

export const clientMeasurementsQueryKey = ['client', 'measurements'] as const;

/** Замеры клиента. Непривязанный (409) → пустой список, не ошибка. */
export function useClientMeasurements() {
  return useQuery<MeasurementResponse[]>({
    queryKey: clientMeasurementsQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/measurements', {
          schema: measurementListResponseSchema,
        });
        return r.measurements;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
  });
}

export function useCreateMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMeasurementRequest) =>
      apiFetch('/client/measurements', {
        method: 'POST',
        body: createMeasurementRequestSchema.parse(input),
        schema: measurementWrap,
      }).then((r) => r.measurement),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeasurementsQueryKey });
    },
  });
}

export interface UpdateMeasurementArgs {
  mid: string;
  input: UpdateMeasurementRequest;
}

export function useUpdateMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mid, input }: UpdateMeasurementArgs) =>
      apiFetch(`/client/measurements/${mid}`, {
        method: 'PATCH',
        body: updateMeasurementRequestSchema.parse(input),
        schema: measurementWrap,
      }).then((r) => r.measurement),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeasurementsQueryKey });
    },
  });
}

export function useDeleteMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mid: string) =>
      apiFetch(`/client/measurements/${mid}`, { method: 'DELETE', schema: okWrap }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeasurementsQueryKey });
    },
  });
}
```

- [ ] **Step 2: Сверить сигнатуру `apiFetch`**

Открыть `apps/web-client/src/api/client.ts` и убедиться, что `apiFetch` принимает `{ method, body, schema }` именно так (как в `chat.ts`). Если `body` сериализуется иначе — привести к фактическому стилю.

- [ ] **Step 3: Прогнать типы**

Run: `npm run typecheck -w apps/web-client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-client/src/api/measurements.ts
git commit -m "feat(web-client): клиентские хуки замеров (CRUD)"
```

---

## Task 4: Фронт — экран `StatsPage` (порт, 2 таба) + маршрут

**Files:**

- Create: `apps/web-client/src/pages/StatsPage.tsx`
- Modify: `apps/web-client/src/App.tsx`

Источник для порта — `apps/web/src/pages/ClientStatsPage.tsx`. Перенести экран целиком со следующими **намеренными правками** (всё остальное — как в оригинале):

- [ ] **Step 1: Создать `StatsPage.tsx` как адаптированный порт**

Правки относительно `ClientStatsPage.tsx`:

1. **Убрать таб «Фото»** и весь `PhotosTab` со связанными импортами (`useClientProgressPhotos`, `useUploadProgressPhoto`, `useDeleteProgressPhoto`, `fileUrl`, `ANGLES`, `AngleValue`, `angleLabel`, `ImagePlus`, `BarChart3`, `PhotoResponse`). Тип `Tab` = `'exercises' | 'measurements'`. В переключателе табов оставить две кнопки.
2. **Убрать зависимость от URL-параметра и тренерских хуков клиента:**
   - удалить `useParams`, `useClient`, `clientId` из props внутренних компонентов;
   - заголовок — статический «Статистика» (без имени клиента); вместо `ScreenHeader` использовать заголовок в стиле других экранов web-client (см. `ChatPage.tsx`: `<h1 className="px-4 pt-5 …">Статистика</h1>`), `ScreenHeader`/`back` не нужен (экран — вкладка нижней навигации).
3. **Импорты данных — клиентские:**
   - тренировки: `import { useClientWorkouts } from '../api/workouts';` и вызывать `useClientWorkouts()` (без аргумента) в `ExercisesTab` и `TonnageChart`;
   - замеры: `import { useClientMeasurements, useCreateMeasurement, useUpdateMeasurement, useDeleteMeasurement } from '../api/measurements';` и вызывать без `clientId`;
   - `LineChart`/`HoldToDelete` — из `../components/...` (порт Task 2);
   - `aggregateExerciseOverview`/`aggregateExerciseHistory`/`workoutRowStats` и типы — из `../lib/workout-stats` (порт Task 2).
4. **Мутации без clientId:** `useCreateMeasurement()`, `useUpdateMeasurement()`, `useDeleteMeasurement()` — без аргумента; вызовы `.mutateAsync`/`.mutate` с тем же payload (`{ mid, input }` для update; `mid` для delete; `CreateMeasurementRequest` для create).
5. **Непривязанный клиент:** добавить в начало `StatsPage` `const me = useClientMe(); const linked = me.data?.link != null;` (импорт `useClientMe` из `../api/auth`). В табе «Замеры» при `!linked` скрыть кнопку «Новый замер» и показать приглашение «Подключите тренера, чтобы вести замеры.» (нейтральный `text-ink-muted`). В табе «Упражнения» при пустых данных текст-приглашение для непривязанного (как в `WorkoutsListPage`: «Вы пока не подключены к тренеру…»).
6. **Внутренние компоненты, которые НЕ зависели от clientId, перенести как есть:** `ChartCard`, `Toggle`, `HistoryTable`, `ExerciseRow`, `ExerciseDetail`, `MeasurementCard`, `MeasurementForm`, `NumField`, `FormGroup`, `MeasurementsAnalytics`, `EmptyState`, форматтеры (`formatTonnage`, `formatTime`, `formatRelativeDate`, `formatRuDate`, `formatSeconds`, `formatFullDate`, `shortRuDate`, `metricPoints`, `RU_MONTHS`, `ANALYTICS_METRICS`, `MetricDef`, `measurementFields`, `MeasurementField`).
7. **Правило цвета (пользователь):** не вводить новый красный текст. Сохраняется существующее использование `text-danger`/`var(--color-danger)` из оригинала ТОЛЬКО там, где оно уже есть (дельта вниз в `ChartCard`, ошибка формы, иконка в `HoldToDelete`) — это допустимо (числовая дельта/ошибка/иконка действия). Новых красных статусов не добавлять.
8. Нет `any`, нет `console.log`.

Итоговый `StatsPage` экспортирует `export function StatsPage()`.

- [ ] **Step 2: Подключить маршрут**

В `apps/web-client/src/App.tsx`:

- добавить `import { StatsPage } from './pages/StatsPage';`
- заменить `<Route path="/progress" element={<StubPage title="Прогресс" />} />` на `<Route path="/progress" element={<StatsPage />} />`.
- `StubPage` оставить импортированным, если ещё используется (проверить остальные маршруты).

- [ ] **Step 3: Прогнать типы, линт, тесты web-client**

Run: `npm run typecheck && npm run test -w apps/web-client`
Expected: PASS (корневой typecheck собирает все воркспейсы).

- [ ] **Step 4: Commit**

```bash
git add apps/web-client/src/pages/StatsPage.tsx apps/web-client/src/App.tsx
git commit -m "feat(web-client): экран Статистика (упражнения + замеры)"
```

---

## Финал

- [ ] Полный `npm run check` зелёный (контроллер).
- [ ] Прогон itest против `trener_test` (контроллер): `client-app-measurements` + регрессия `measurements` — зелёные.
- [ ] Контроллер: пересборка docker (api + web-client) — миграций нет. Live-проверка curl: регистрация клиента → привязка → `POST /api/client/measurements` → `GET` (виден свой) → `PATCH` → `DELETE`; + завершённая тренировка от тренера → видна в статистике упражнений (опц.).
- [ ] superpowers:finishing-a-development-branch.

## Self-review (план против спеки)

- Фасад `client-app-measurements` (GET/POST/PATCH/DELETE, 401/409/404, скоуп) → Task 1 ✓
- Регистрация в app.ts → Task 1 ✓
- Порт `workout-stats.ts`(+test)/`LineChart`/`HoldToDelete` → Task 2 ✓
- Клиентские хуки замеров (409→[], инвалидация) → Task 3 ✓
- Экран `StatsPage`: 2 таба, без таба «Фото», без clientId из URL, клиентские хуки, приглашение при 409, правило цвета → Task 4 ✓
- Маршрут `/progress` → StatsPage → Task 4 ✓
- Тесты: isolation itest (свои/чужие 404, 401/409, CRUD) + порт workout-stats.test → Tasks 1–2 ✓
- Тренировки — существующий `client-app-workouts`, новый бэкенд не нужен → согласовано ✓
- Типы согласованы: хуки замеров используют контракты `@trener/shared`; сервис `measurements` методы `(trainerId, clientId, …)` совпадают с вызовами фасада.
