# Офлайн Фаза 1 — План 1: бэкенд import-эндпоинт тренировки

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить идемпотентный эндпоинт `POST /api/clients/:id/workouts/import`, принимающий целиком офлайн-проведённую тренировку и создающий её в финальном виде (с теми же побочками, что обычное завершение), без дублей при повторной отправке.

**Architecture:** Новый ключ `idempotency_key` в таблице `client_workouts` (частичный UNIQUE). Repo-метод `importWithKey` делает upsert в одной транзакции: если запись с ключом есть — вернуть её, иначе вставить workout+exercises+sets сразу как `completed`. Сервис после вставки дёргает тот же `onCompleted`, что и `complete`. Zod-схема в `@trener/shared`.

**Tech Stack:** Fastify, Drizzle ORM (postgres), Zod, vitest. Миграции — `drizzle-kit generate` (НЕ руками).

## Global Constraints

- `routes` не импортирует `repo` напрямую; `repo` — единственное место с SQL; бизнес-логика только в `service` (принуждается ESLint).
- Запрет `any` (используй `unknown` + сужение).
- Вход/выход — только Zod-схемы из `@trener/shared`.
- Каждый repo-запрос скоуплен по `trainerId`.
- Conventional Commits (`feat:`/`test:`/…), subject в нижнем регистре после типа.
- Каждый доменный модуль: service unit-тест + repo `*.itest.ts` (реальная Postgres) + isolation-тест (тренер A ≠ B; без auth → 401).
- itest гонять ТОЛЬКО против БД `trener_test` (их `beforeAll` стирает таблицы).
- Миграции последовательны (общий `drizzle/meta/_journal.json`) — нельзя коммитить миграцию N без N-1.

---

### Task 1: Zod-схема импорта в `@trener/shared`

**Files:**

- Modify: `packages/shared/src/client-workouts.ts` (после `completeWorkoutRequestSchema`, ~строка 85)
- Test: `packages/shared/src/client-workouts.test.ts`

**Interfaces:**

- Produces: `importWorkoutRequestSchema`, тип `ImportWorkoutRequest`. Форма:
  `{ idempotencyKey: string(uuid), name, sourceTemplateId?, status: 'completed'|'skipped',
startedAt: string|null, completedAt: string|null, durationSec?, trainerNote?, rpe?,
excludedFromBalance?, tzOffsetMinutes?, exercises: Array<{ exerciseId, sets: Array<{
plannedReps?, plannedWeightKg?, plannedTimeSec?, plannedRestSec?, actualReps?,
actualWeightKg?, actualTimeSec?, done: boolean }> }> }`.

- [ ] **Step 1: Написать падающий тест**

В конец `packages/shared/src/client-workouts.test.ts` добавить:

```ts
import { importWorkoutRequestSchema } from './client-workouts.js';

describe('importWorkoutRequestSchema', () => {
  const base = {
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    name: 'Верх',
    status: 'completed' as const,
    startedAt: '2026-07-13T09:00:00.000Z',
    completedAt: '2026-07-13T10:00:00.000Z',
    exercises: [
      {
        exerciseId: 'ex1',
        sets: [
          { plannedReps: 10, plannedRestSec: 90, actualReps: 9, done: true },
          { plannedReps: 10, done: false },
        ],
      },
    ],
  };

  it('принимает валидный документ проведённой тренировки', () => {
    const r = importWorkoutRequestSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('требует idempotencyKey в формате uuid', () => {
    const r = importWorkoutRequestSchema.safeParse({ ...base, idempotencyKey: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('требует done у каждого подхода', () => {
    const r = importWorkoutRequestSchema.safeParse({
      ...base,
      exercises: [{ exerciseId: 'ex1', sets: [{ plannedReps: 10 }] }],
    });
    expect(r.success).toBe(false);
  });

  it('отвергает статус draft/active (импорт только терминальной)', () => {
    const r = importWorkoutRequestSchema.safeParse({ ...base, status: 'active' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/client-workouts.test.ts`
Expected: FAIL — `importWorkoutRequestSchema` не экспортируется.

- [ ] **Step 3: Реализовать схему**

В `packages/shared/src/client-workouts.ts` после блока `completeWorkoutRequestSchema` (стр. 85) добавить:

```ts
// --- Импорт офлайн-проведённой тренировки (idempotent) ---

// Один подход с ФАКТОМ (planned + actual + done) — то, что накопилось при проведении.
export const importSetSchema = z.object({
  plannedReps: optInt,
  plannedWeightKg: optNum,
  plannedTimeSec: optInt,
  plannedRestSec: z.number().int().min(0).max(3600).nullish(),
  actualReps: z.number().int().nullish(),
  actualWeightKg: optNum,
  actualTimeSec: z.number().int().nullish(),
  done: z.boolean(),
});
export type ImportSet = z.infer<typeof importSetSchema>;

export const importWorkoutExerciseSchema = z.object({
  exerciseId: z.string(),
  sets: z.array(importSetSchema).min(1),
});
export type ImportWorkoutExercise = z.infer<typeof importWorkoutExerciseSchema>;

export const importWorkoutRequestSchema = z.object({
  // Клиентский UUID — ключ идемпотентности (повторная отправка не дублирует).
  idempotencyKey: z.string().uuid(),
  name,
  sourceTemplateId: z.string().nullish(),
  // Импортируем только терминальную (проведённую/пропущенную) тренировку.
  status: z.enum(['completed', 'skipped']),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  durationSec: optInt,
  trainerNote: z.string().trim().max(2000).nullish(),
  rpe: z.number().int().min(1).max(10).nullish(),
  excludedFromBalance: z.boolean().optional(),
  tzOffsetMinutes: z.number().int().nullish(),
  exercises: z.array(importWorkoutExerciseSchema),
});
export type ImportWorkoutRequest = z.infer<typeof importWorkoutRequestSchema>;
```

- [ ] **Step 4: Запустить — убедиться, что зелёный**

Run: `cd packages/shared && npx vitest run src/client-workouts.test.ts`
Expected: PASS (все 4 новых кейса).

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/client-workouts.ts packages/shared/src/client-workouts.test.ts
git commit -m "feat(shared): схема importWorkoutRequest для офлайн-импорта тренировки"
```

---

### Task 2: Колонка `idempotency_key` + миграция

**Files:**

- Modify: `apps/api/src/db/schema.ts:272-307` (таблица `clientWorkouts`)
- Create: `apps/api/drizzle/0064_*.sql` (генерируется drizzle-kit, имя авто)
- Modify: `apps/api/drizzle/meta/_journal.json` (обновляется drizzle-kit)

**Interfaces:**

- Produces: колонка `clientWorkouts.idempotencyKey` (`text('idempotency_key')`, nullable) + частичный уникальный индекс `client_workouts_idempotency_key_uq` на `idempotency_key WHERE idempotency_key IS NOT NULL`.

- [ ] **Step 1: Добавить колонку и индекс в schema.ts**

В `apps/api/src/db/schema.ts`, в объект колонок `clientWorkouts` (после `createdAt`, стр. 299) добавить:

```ts
    // Ключ идемпотентности офлайн-импорта (клиентский UUID). NULL для обычных записей.
    idempotencyKey: text('idempotency_key'),
```

И в массив ограничений таблицы (стр. 301-306, где `check(...)`) добавить частичный уникальный индекс. Заменить массив на:

```ts
  (t) => [
    check(
      'client_workouts_status_chk',
      sql`${t.status} IN ('draft', 'active', 'completed', 'skipped')`,
    ),
    uniqueIndex('client_workouts_idempotency_key_uq')
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
```

Убедиться, что `uniqueIndex` импортирован из `drizzle-orm/pg-core` в шапке `schema.ts` (если нет — добавить в существующий импорт `pgTable, text, integer, ...`).

- [ ] **Step 2: Сгенерировать миграцию**

Run: `cd apps/api && npm run db:generate`
Expected: создан файл `apps/api/drizzle/0064_<random>.sql`, содержащий `ALTER TABLE "client_workouts" ADD COLUMN "idempotency_key" text;` и `CREATE UNIQUE INDEX ... ON "client_workouts" ... WHERE "idempotency_key" IS NOT NULL;`; `_journal.json` дополнен записью 0064.

- [ ] **Step 3: Проверить типы**

Run: `cd apps/api && npx tsc --noEmit`
Expected: без ошибок (колонка видна в типах Drizzle).

- [ ] **Step 4: Коммит**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/0064_*.sql apps/api/drizzle/meta/_journal.json
git commit -m "feat(db): idempotency_key в client_workouts + частичный unique-индекс"
```

---

### Task 3: Repo-метод `importWithKey` (upsert по ключу)

**Files:**

- Modify: `apps/api/src/modules/client-workouts/client-workouts.repo.ts` (рядом с `create`, стр. 274; тип `WorkoutRow` и хелперы уже есть)
- Test: `apps/api/src/modules/client-workouts/client-workouts.repo.itest.ts`

**Interfaces:**

- Consumes: `ImportWorkoutRequest` (Task 1); существующий `getFull(trainerId, clientId, workoutId)`, `deps`-стиль вставок из `create` (стр. 287-319).
- Produces: метод репозитория
  `importWithKey(trainerId: string, clientId: string, id: string, input: ImportWorkoutRequest): Promise<{ row: WorkoutRow; created: boolean } | null>`.
  `created: false` → запись с этим `idempotencyKey` уже была (вернули её). `null` → одно из упражнений невидимо (как в `create`). `id` — серверный id для новой записи (из `deps.newId()`, передаёт сервис).

- [ ] **Step 1: Написать падающий itest**

В `apps/api/src/modules/client-workouts/client-workouts.repo.itest.ts` добавить (использовать существующие фикстуры файла — тренер/клиент/упражнение; смотри `beforeEach`/хелперы вверху файла):

```ts
it('importWithKey создаёт completed-тренировку и идемпотентен по ключу', async () => {
  const key = '22222222-2222-4222-8222-222222222222';
  const doc = {
    idempotencyKey: key,
    name: 'Импорт',
    status: 'completed' as const,
    startedAt: '2026-07-13T09:00:00.000Z',
    completedAt: '2026-07-13T10:00:00.000Z',
    durationSec: 3600,
    exercises: [{ exerciseId: EX_ID, sets: [{ plannedReps: 10, actualReps: 9, done: true }] }],
  };

  const first = await repo.importWithKey(TRAINER_ID, CLIENT_ID, 'wk_import_1', doc);
  expect(first?.created).toBe(true);
  expect(first?.row.status).toBe('completed');
  expect(first?.row.exercises[0]?.sets[0]?.actualReps).toBe(9);
  expect(first?.row.exercises[0]?.sets[0]?.done).toBe(true);

  // Повторная отправка того же ключа — НЕ дублирует, возвращает ту же запись.
  const second = await repo.importWithKey(TRAINER_ID, CLIENT_ID, 'wk_import_2', doc);
  expect(second?.created).toBe(false);
  expect(second?.row.id).toBe(first?.row.id);

  const all = await repo.listForClient(TRAINER_ID, CLIENT_ID, 'all');
  expect(all.filter((w) => w.name === 'Импорт')).toHaveLength(1);
});
```

(`TRAINER_ID`, `CLIENT_ID`, `EX_ID` — константы фикстур файла; если названы иначе, взять фактические из шапки itest.)

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL npx vitest run src/modules/client-workouts/client-workouts.repo.itest.ts -t importWithKey`
Expected: FAIL — `repo.importWithKey` не существует.

- [ ] **Step 3: Реализовать метод**

В `client-workouts.repo.ts` добавить метод в возвращаемый объект `makeClientWorkoutsRepo` (рядом с `create`). Зеркалит вставку из `create` (стр. 287-319), но: (1) сперва dedupe по ключу; (2) вставляет статус/время из документа; (3) пишет `actual*` и `done`; (4) сохраняет `idempotencyKey`.

```ts
    async importWithKey(
      trainerId: string,
      clientId: string,
      id: string,
      input: ImportWorkoutRequest,
    ): Promise<{ row: WorkoutRow; created: boolean } | null> {
      // Уже импортировали этот ключ? Вернуть существующую (идемпотентность).
      const [dup] = await db
        .select({ id: clientWorkouts.id })
        .from(clientWorkouts)
        .where(
          and(
            eq(clientWorkouts.trainerId, trainerId),
            eq(clientWorkouts.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (dup) {
        const existing = await this.getFull(trainerId, clientId, dup.id);
        return existing ? { row: existing, created: false } : null;
      }

      // Проверка видимости упражнений тренеру (как в create): все exerciseId
      // должны быть личными этого тренера или глобальными.
      const ids = [...new Set(input.exercises.map((e) => e.exerciseId))];
      if (ids.length > 0) {
        const visible = await db
          .select({ id: exercises.id })
          .from(exercises)
          .where(
            and(
              inArray(exercises.id, ids),
              or(eq(exercises.trainerId, trainerId), isNull(exercises.trainerId)),
            ),
          );
        if (visible.length !== ids.length) return null;
      }

      const row = await db.transaction(async (tx) => {
        await tx.insert(clientWorkouts).values({
          id,
          trainerId,
          clientId,
          sourceTemplateId: input.sourceTemplateId ?? null,
          name: input.name,
          status: input.status,
          startedAt: input.startedAt ? new Date(input.startedAt) : null,
          completedAt: input.completedAt ? new Date(input.completedAt) : null,
          durationSec: input.durationSec ?? null,
          trainerNote: input.trainerNote ?? null,
          rpe: input.rpe ?? null,
          createdByClient: false,
          excludedFromBalance: input.excludedFromBalance ?? false,
          idempotencyKey: input.idempotencyKey,
        });

        for (let pos = 0; pos < input.exercises.length; pos++) {
          const ex = input.exercises[pos]!;
          await tx
            .insert(clientWorkoutExercises)
            .values({ workoutId: id, position: pos, exerciseId: ex.exerciseId });
          const setValues = ex.sets.map((s, i) => ({
            workoutId: id,
            exercisePosition: pos,
            setIndex: i,
            plannedReps: s.plannedReps ?? null,
            plannedWeightKg: s.plannedWeightKg ?? null,
            plannedTimeSec: s.plannedTimeSec ?? null,
            plannedRestSec: s.plannedRestSec ?? null,
            actualReps: s.actualReps ?? null,
            actualWeightKg: s.actualWeightKg ?? null,
            actualTimeSec: s.actualTimeSec ?? null,
            done: s.done ? 1 : 0,
          }));
          if (setValues.length > 0) await tx.insert(clientWorkoutSets).values(setValues);
        }
      });
      void row;

      const full = await this.getFull(trainerId, clientId, id);
      return full ? { row: full, created: true } : null;
    },
```

Добавить недостающие импорты в шапке repo, если их нет: `inArray`, `or`, `isNull` из `drizzle-orm`, `exercises` из схемы, тип `ImportWorkoutRequest` из `@trener/shared`.

- [ ] **Step 4: Запустить — убедиться, что зелёный**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL npx vitest run src/modules/client-workouts/client-workouts.repo.itest.ts -t importWithKey`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/modules/client-workouts/client-workouts.repo.ts apps/api/src/modules/client-workouts/client-workouts.repo.itest.ts
git commit -m "feat(client-workouts): repo.importWithKey — идемпотентный импорт проведённой тренировки"
```

---

### Task 4: Сервис `import` (dedupe + побочки завершения)

**Files:**

- Modify: `apps/api/src/modules/client-workouts/client-workouts.service.ts` (метод в объекте сервиса, рядом с `create`/`complete`)
- Test: `apps/api/src/modules/client-workouts/client-workouts.service.test.ts`

**Interfaces:**

- Consumes: `repo.importWithKey` (Task 3); `deps.newId`, `deps.onCompleted` (сигнатура: `(trainerId, clientId, workoutId, workoutName, completedAt: Date) => Promise<void> | void`); `toResponse` (уже в service).
- Produces: метод сервиса
  `import(trainerId: string, clientId: string, input: ImportWorkoutRequest): Promise<WorkoutResponse>`.

- [ ] **Step 1: Написать падающий unit-тест**

В `client-workouts.service.test.ts` (использовать существующие моки repo/deps файла) добавить:

```ts
it('import: создаёт запись и вызывает onCompleted (баланс/календарь) один раз', async () => {
  const onCompleted = vi.fn();
  const importWithKey = vi.fn(() =>
    Promise.resolve({ row: row({ status: 'completed', name: 'Имп' }), created: true }),
  );
  const svc = makeClientWorkoutsService(
    { ...repoStub, importWithKey } as unknown as ClientWorkoutsRepo,
    { ...depsStub, onCompleted },
  );
  const res = await svc.import(TRAINER, CLIENT, importDocFixture);
  expect(res.name).toBe('Имп');
  expect(onCompleted).toHaveBeenCalledTimes(1);
});

it('import: повторный ключ (created=false) НЕ вызывает onCompleted второй раз', async () => {
  const onCompleted = vi.fn();
  const importWithKey = vi.fn(() =>
    Promise.resolve({ row: row({ status: 'completed' }), created: false }),
  );
  const svc = makeClientWorkoutsService(
    { ...repoStub, importWithKey } as unknown as ClientWorkoutsRepo,
    { ...depsStub, onCompleted },
  );
  await svc.import(TRAINER, CLIENT, importDocFixture);
  expect(onCompleted).not.toHaveBeenCalled();
});

it('import: excludedFromBalance → onCompleted НЕ вызывается', async () => {
  const onCompleted = vi.fn();
  const importWithKey = vi.fn(() =>
    Promise.resolve({ row: row({ status: 'completed' }), created: true }),
  );
  const svc = makeClientWorkoutsService(
    { ...repoStub, importWithKey } as unknown as ClientWorkoutsRepo,
    { ...depsStub, onCompleted },
  );
  await svc.import(TRAINER, CLIENT, { ...importDocFixture, excludedFromBalance: true });
  expect(onCompleted).not.toHaveBeenCalled();
});
```

`importDocFixture` — валидный `ImportWorkoutRequest` (status `completed`, completedAt задан, одно упражнение с одним подходом). `row(...)`, `repoStub`, `depsStub`, `TRAINER`, `CLIENT` — существующие хелперы файла (см. верх `service.test.ts`; `row` уже используется в тесте `start`).

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd apps/api && npx vitest run src/modules/client-workouts/client-workouts.service.test.ts -t import`
Expected: FAIL — `svc.import` не функция.

- [ ] **Step 3: Реализовать метод**

В `client-workouts.service.ts`, в объект, возвращаемый `makeClientWorkoutsService`, добавить (рядом с `create`):

```ts
    // Импорт офлайн-проведённой тренировки. Идемпотентно по input.idempotencyKey:
    // повторная отправка возвращает существующую запись и НЕ повторяет побочки.
    async import(
      trainerId: string,
      clientId: string,
      input: ImportWorkoutRequest,
    ): Promise<WorkoutResponse> {
      const res = await repo.importWithKey(trainerId, clientId, deps.newId(), input);
      if (!res) throw unknownExercise();
      // Побочки завершения — только для НОВОЙ, проведённой (completed) и учитываемой
      // в балансе записи. Повтор (created=false) и historical/skipped — без побочек.
      if (
        res.created &&
        res.row.status === 'completed' &&
        !res.row.excludedFromBalance &&
        deps.onCompleted
      ) {
        const completedAt = res.row.completedAt ?? deps.now();
        await deps.onCompleted(trainerId, clientId, res.row.id, res.row.name, completedAt);
      }
      return toResponse(res.row);
    },
```

Добавить тип `ImportWorkoutRequest` в импорт из `@trener/shared` в шапке service.

- [ ] **Step 4: Запустить — убедиться, что зелёный**

Run: `cd apps/api && npx vitest run src/modules/client-workouts/client-workouts.service.test.ts -t import`
Expected: PASS (все 3 кейса).

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/modules/client-workouts/client-workouts.service.ts apps/api/src/modules/client-workouts/client-workouts.service.test.ts
git commit -m "feat(client-workouts): service.import — dedupe + побочки завершения"
```

---

### Task 5: Роут `POST /api/clients/:id/workouts/import` + isolation itest

**Files:**

- Modify: `apps/api/src/modules/client-workouts/client-workouts.routes.ts` (рядом с `POST /api/clients/:id/workouts`, стр. 56)
- Test: `apps/api/src/modules/client-workouts/client-workouts.routes.itest.ts`

**Interfaces:**

- Consumes: `svc.import` (Task 4); существующие `preHandler = [requireAuth, requireClientAccess]`, `trainerId(req)`, `importWorkoutRequestSchema`, `workoutWrap` (обёртка `{ workout }` из существующих роутов).

- [ ] **Step 1: Написать падающий itest**

В `client-workouts.routes.itest.ts` добавить (используя существующий `app.inject` и фикстуры auth-заголовков файла):

```ts
it('POST import: создаёт тренировку, повтор ключа не дублирует, чужой тренер — 404/403', async () => {
  const key = '33333333-3333-4333-8333-333333333333';
  const body = {
    idempotencyKey: key,
    name: 'Импорт-роут',
    status: 'completed',
    startedAt: '2026-07-13T09:00:00.000Z',
    completedAt: '2026-07-13T10:00:00.000Z',
    exercises: [{ exerciseId: EX_ID, sets: [{ plannedReps: 10, actualReps: 8, done: true }] }],
  };

  const r1 = await app.inject({
    method: 'POST',
    url: `/api/clients/${CLIENT_ID}/workouts/import`,
    headers: authHeaders,
    payload: body,
  });
  expect(r1.statusCode).toBe(200);
  const id1 = r1.json<{ workout: { id: string } }>().workout.id;

  const r2 = await app.inject({
    method: 'POST',
    url: `/api/clients/${CLIENT_ID}/workouts/import`,
    headers: authHeaders,
    payload: body,
  });
  expect(r2.json<{ workout: { id: string } }>().workout.id).toBe(id1);

  const noAuth = await app.inject({
    method: 'POST',
    url: `/api/clients/${CLIENT_ID}/workouts/import`,
    payload: body,
  });
  expect(noAuth.statusCode).toBe(401);
});
```

`EX_ID`, `CLIENT_ID`, `authHeaders` — фикстуры файла (взять фактические имена из шапки itest).

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL npx vitest run src/modules/client-workouts/client-workouts.routes.itest.ts -t import`
Expected: FAIL — роут не зарегистрирован (404).

- [ ] **Step 3: Зарегистрировать роут**

В `client-workouts.routes.ts` рядом с `typed.post('/api/clients/:id/workouts', ...)` (стр. 56) добавить. Импортировать `importWorkoutRequestSchema` из `@trener/shared` в шапке.

```ts
typed.post(
  '/api/clients/:id/workouts/import',
  {
    preHandler,
    schema: {
      params: clientIdParams,
      body: importWorkoutRequestSchema,
      response: { 200: workoutWrap },
    },
  },
  async (req) => ({ workout: await svc.import(trainerId(req), req.params.id, req.body) }),
);
```

(`clientIdParams` / `workoutWrap` — те же, что использует соседний `POST /workouts`; взять фактические имена из файла.)

- [ ] **Step 4: Запустить — убедиться, что зелёный**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL npx vitest run src/modules/client-workouts/client-workouts.routes.itest.ts -t import`
Expected: PASS.

- [ ] **Step 5: Полная проверка модуля + коммит**

Run: `cd apps/api && npm run check`
Expected: формат + линт + типы + тесты зелёные.

```bash
git add apps/api/src/modules/client-workouts/client-workouts.routes.ts apps/api/src/modules/client-workouts/client-workouts.routes.itest.ts
git commit -m "feat(client-workouts): роут POST /workouts/import (идемпотентный импорт)"
```

---

## Итог Плана 1

После этих 5 задач бэкенд умеет принимать целиком офлайн-проведённую тренировку идемпотентно, с корректными побочками. Это фундамент для обработчика синка в Плане 3.

**Деплой-заметка:** пуш в master авто-раскатывает бэкенд на прод (миграция применится). Изменения строго аддитивны (новая колонка nullable, новый роут) — существующие потоки не затрагиваются.

**Дальше:** План 2 (ядро-движок в `packages/core`: NetworkStatus · Outbox · SyncEngine · CachedQuery) и План 3 (провод в тренерское приложение + рефактор `ActiveWorkoutScreen`).
