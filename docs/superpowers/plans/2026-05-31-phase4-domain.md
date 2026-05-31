# Фаза 4: Доменные модули — exercises, templates, client-workouts, sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Четыре доменных модуля поверх ядра Фазы 3: каталог упражнений (глобальный + личный), шаблоны тренировок, тренировки клиента (с упражнениями/подходами и жизненным циклом), занятия-календарь. Все — по эталону `clients` (repo scoped по `trainerId`, вложенные ресурсы под клиентом через `requireClientAccess`, split routes/module, isolation-тесты).

**Architecture:** Каждый модуль — `apps/api/src/modules/<m>/` с `<m>.repo.ts` (Drizzle, scoped), `<m>.service.ts` (логика + `notFound`), `<m>.routes.ts` (HTTP-only, без repo/db), `<m>.module.ts` (`registerXxxModule(app,{db})` собирает repo/service/guard и зовёт routes), Zod-контракты в `@trener/shared`. `client-workouts` и `sessions` — вложены под клиента: используют `requireClientAccess` (тренер связан с клиентом) + scope по `trainerId`. Каталоги (`exercises`, `workout_templates`) — глобальные системные записи (`trainer_id IS NULL`, read-only для всех) + личные записи тренера (CRUD).

**Tech Stack:** Fastify 5, Drizzle ORM, PostgreSQL, Zod (type-provider), Vitest. Всё из Фаз 1–3.

**Решения по объёму (зафиксированы владельцем):**

- Реализуются **все 4 модуля** в этой фазе.
- Упражнения: **глобальный системный каталог** (`trainer_id IS NULL`, виден всем, read-only) **+ личные** упражнения тренера (CRUD).
- Шаблоны тренировок — **личные** у тренера (CRUD); глобальные шаблоны — позже (YAGNI).
- Поля — минимальные, расширяемые (как в Фазе 3).
- Только тренер (клиентских аккаунтов нет).

---

## Эталон модуля (из Фазы 3 — следовать точно)

Готовый отревьюенный референс в репозитории — модуль `clients`:

- `apps/api/src/modules/clients/clients.repo.ts` — `makeClientsRepo(db)`, все методы принимают `trainerId`, фильтрация `WHERE trainer_id = ?`; `create` в `db.transaction`; для вложенных операций — guard связи перед мутацией.
- `apps/api/src/modules/clients/clients.service.ts` — `makeClientsService(repo, { newId })`, `notFound` на отсутствие, `toResponse`-маппинг (Date → ISO).
- `apps/api/src/modules/clients/clients.routes.ts` — HTTP-only: импортирует **тип** сервиса, shared-схемы, `requireAuth`, тип guard; **НЕ** импортирует repo/db (eslint-граница).
- `apps/api/src/modules/clients/clients.module.ts` — `registerClientsModule(app, { db })`: собирает repo+service+guard, зовёт `clientsRoutes`.
- `apps/api/src/plugins/require-client-access.ts` — `makeRequireClientAccess({ isLinked })` → preHandler 404 на чужого/несвязанного.
- Тесты: `*.service.test.ts` (unit, мок repo типизирован как `XxxRepo`, без `as never`), `*.repo.itest.ts` (integration, `beforeEach` cleanup), `*.routes.itest.ts` (CRUD через HTTP с auth-cookie), `*.isolation.itest.ts` (тренер A ≠ тренер B → 404).
- Подключение: `registerXxxModule(app, { db: deps.db })` в `buildApp` (`apps/api/src/app.ts`) после уже существующих.

**Конвенции окружения:** ветка фазы, локально `core.autocrlf=false`+LF; коммиты Conventional Commits (subject нижний регистр), тело через файл БЕЗ BOM + `git commit -F`; НЕ `--no-verify`. Интеграционные тесты — `*.itest.ts` (skipIf без `DATABASE_URL`), гонять с Docker-Postgres; `npm run check` без БД должен быть exit 0. Type-provider: схемы на каждом роуте.

**Общий рефактор в начале фазы (carry-forward Фазы 3, Task 0):** вынести `newId`/`now` в общий провайдер, чтобы модули не хардкодили `randomUUID`.

---

## Структура файлов (создаётся в этой фазе)

```text
packages/shared/src/
  exercises.ts, workout-templates.ts, client-workouts.ts, sessions.ts   [NEW]
  index.ts                                                              [MOD]
apps/api/src/
  db/schema.ts                                                          [MOD]  (+5 таблиц)
  app.ts                                                                [MOD]  (+4 register, общий deps)
  core/app-deps.ts                                                      [NEW]  (newId/now провайдер)
  modules/exercises/         (repo, service, routes, module, +tests)    [NEW]
  modules/workout-templates/ (repo, service, routes, module, +tests)    [NEW]
  modules/client-workouts/   (repo, service, routes, module, +tests)    [NEW]
  modules/sessions/          (repo, service, routes, module, +tests)    [NEW]
```

---

### Task 0: Общий провайдер `AppDeps` (newId/now)

**Files:**

- Create: `apps/api/src/core/app-deps.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/modules/clients/clients.module.ts`

- [ ] **Step 1: Создать `apps/api/src/core/app-deps.ts`**

```ts
import { randomUUID } from 'node:crypto';

// Общие зависимости-провайдеры для доменных модулей (детерминизм в тестах).
export type Clock = { newId: () => string; now: () => Date };

export const realClock: Clock = {
  newId: () => randomUUID(),
  now: () => new Date(),
};
```

- [ ] **Step 2: Прокинуть в clients-модуль**

`registerClientsModule(app, { db, clock })` — добавить `clock: Clock` в опции, прокинуть в `makeClientsService(repo, { newId: clock.newId })`. В `app.ts` создать `const clock = realClock;` один раз и передавать во все `register*Module`. Обновить вызов clients.

- [ ] **Step 3: `npm run check` → exit 0 (clients-тесты не сломаны). Commit**

```
refactor(api): общий провайдер newId/now (AppDeps) для модулей
```

---

## Часть A — Exercises (глобальный + личный каталог)

### Task A1: Схема `exercises` + миграция

**Files:** Modify `apps/api/src/db/schema.ts`; Test `apps/api/src/db/exercises-schema.itest.ts`

- [ ] **Step 1: Таблица `exercises` (`schema.ts`)**

```ts
export const exercises = pgTable('exercises', {
  id: text('id').primaryKey(),
  // NULL = глобальная системная запись (видна всем, read-only); иначе личная запись тренера.
  trainerId: text('trainer_id').references(() => trainers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  defaultReps: integer('default_reps'),
  defaultWeightKg: doublePrecision('default_weight_kg'),
  defaultTimeSec: integer('default_time_sec'),
  restSec: integer('rest_sec').notNull().default(90),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

> Добавить импорты `integer`, `doublePrecision` к существующим из `drizzle-orm/pg-core`.

- [ ] **Step 2:** `npm --prefix apps/api run db:generate` → `0003_*.sql` (таблица exercises, FK nullable).
- [ ] **Step 3:** Падающий integration-тест `exercises-schema.itest.ts` (skipIf, beforeEach cleanup): вставка глобальной (trainerId null) и личной записи, выборка.
- [ ] **Step 4:** Docker-прогон (postgres на 5435, db:migrate, vitest файла) → PASS. Останов контейнера.
- [ ] **Step 5:** `npm run check` → 0. Commit `feat(api): схема exercises (глобальный + личный), миграция`

### Task A2: Контракты exercises (`@trener/shared`)

**Files:** Create `packages/shared/src/exercises.ts`; Modify `index.ts`; Test `exercises.test.ts`

- [ ] **Step 1: Падающий тест** (create trim name/category; update partial; response).
- [ ] **Step 2: Реализация (`exercises.ts`)**

```ts
import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const category = z.string().trim().min(1).max(100);
const optInt = z.number().int().positive().nullish();
const optNum = z.number().positive().nullish();

export const createExerciseRequestSchema = z.object({
  name,
  category,
  description: z.string().trim().max(4000).nullish(),
  defaultReps: optInt,
  defaultWeightKg: optNum,
  defaultTimeSec: optInt,
  restSec: z.number().int().min(0).max(3600).default(90),
  note: z.string().trim().max(2000).nullish(),
});
export type CreateExerciseRequest = z.infer<typeof createExerciseRequestSchema>;

export const updateExerciseRequestSchema = createExerciseRequestSchema.partial();
export type UpdateExerciseRequest = z.infer<typeof updateExerciseRequestSchema>;

export const exerciseResponseSchema = z.object({
  id: z.string(),
  isGlobal: z.boolean(), // trainerId === null
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  defaultReps: z.number().nullable(),
  defaultWeightKg: z.number().nullable(),
  defaultTimeSec: z.number().nullable(),
  restSec: z.number(),
  note: z.string().nullable(),
});
export type ExerciseResponse = z.infer<typeof exerciseResponseSchema>;

export const exerciseListResponseSchema = z.object({ exercises: z.array(exerciseResponseSchema) });
```

- [ ] **Step 3:** Реэкспорт в index.ts. PASS. Commit `feat(shared): контракты exercises`

### Task A3: exercises repo + service + routes + module + тесты

**Files:** Create `apps/api/src/modules/exercises/{exercises.repo.ts,exercises.repo.itest.ts,exercises.service.ts,exercises.service.test.ts,exercises.routes.ts,exercises.module.ts,exercises.routes.itest.ts,exercises.isolation.itest.ts}`; Modify `app.ts`

Следовать эталону `clients`. Специфика exercises (глобальный + личный):

- **repo** (`makeExercisesRepo(db)`):
  - `list(trainerId)`: вернуть записи `WHERE trainer_id = :trainerId OR trainer_id IS NULL` (личные + глобальные), сортировка по name.
  - `getVisible(trainerId, id)`: запись, если она личная этого тренера ИЛИ глобальная; иначе null.
  - `getOwn(trainerId, id)`: только личная запись тренера (для update/delete); null если глобальная или чужая.
  - `create({ id, trainerId, ...fields })`: вставка личной (trainer_id = trainerId).
  - `update(trainerId, id, patch)`: апдейт только своей записи (`WHERE id = :id AND trainer_id = :trainerId`); вернуть строку или null.
  - `delete(trainerId, id)`: удаление только своей (`WHERE id AND trainer_id`); boolean.
  - `toResponse`: `isGlobal = row.trainerId === null`.
- **service** (`makeExercisesService(repo, { newId })`): list; get (getVisible, 404 если null); create; update (getOwn-логика в repo, 404 если null → нельзя править глобальные/чужие); remove (404 если delete=false).
- **routes** (`exercisesRoutes`): GET /api/exercises (list), GET /api/exercises/:id (get), POST (create), PATCH /api/exercises/:id, DELETE /api/exercises/:id — все через `requireAuth`. (Тут НЕ нужен requireClientAccess — это каталог тренера, не вложенный под клиента.)
- **module** (`registerExercisesModule(app, { db, clock })`), подключить в `app.ts`.
- **тесты:** repo.itest (личные/глобальные видимы в list; getOwn не отдаёт глобальную; update/delete не трогают глобальную/чужую); service.test (404 на правку глобальной/несуществующей); routes.itest (CRUD); isolation.itest (тренер B не видит личные A; B не может PATCH/DELETE личное A → 404; глобальные видят оба).

- [ ] **Step 1:** repo + repo.itest (TDD: тест падает без repo; Docker-прогон PASS).
- [ ] **Step 2:** service + service.test (TDD).
- [ ] **Step 3:** routes + module + подключение в app.ts + routes.itest (Docker PASS).
- [ ] **Step 4:** isolation.itest (Docker PASS): личное A невидимо/неизменяемо для B (404); глобальное видимо обоим.
- [ ] **Step 5:** `npm run check` → 0. Commits: `feat(api): exercises.repo (личный+глобальный, scoped)`, `feat(api): exercises.service`, `feat(api): exercises-роуты + registerExercisesModule`, `test(api): isolation-тесты exercises`.

---

## Часть B — Workout-templates (шаблоны + упражнения шаблона)

### Task B1: Схема `workout_templates` + `workout_template_exercises` + миграция

- [ ] **Step 1: Таблицы (`schema.ts`)**

```ts
export const workoutTemplates = pgTable('workout_templates', {
  id: text('id').primaryKey(),
  trainerId: text('trainer_id')
    .notNull()
    .references(() => trainers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  categoryTag: text('category_tag'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workoutTemplateExercises = pgTable(
  'workout_template_exercises',
  {
    templateId: text('template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    sets: integer('sets').notNull(),
    reps: integer('reps'),
    weightKg: doublePrecision('weight_kg'),
    timeSec: integer('time_sec'),
    restSec: integer('rest_sec').notNull().default(90),
  },
  (t) => [primaryKey({ columns: [t.templateId, t.position] })],
);
```

- [ ] **Step 2–5:** миграция `0004_*`; schema.itest; Docker-прогон; check; commit `feat(api): схема workout_templates (+ exercises шаблона), миграция`.

### Task B2: Контракты workout-templates

- [ ] Создать `packages/shared/src/workout-templates.ts`: `templateExerciseSchema` (exerciseId, sets, reps?, weightKg?, timeSec?, restSec); `createTemplateRequestSchema` (name, categoryTag?, exercises: array(templateExerciseSchema).min(1)); `updateTemplateRequestSchema` (partial, но exercises при наличии заменяет весь список); `templateResponseSchema` (id, name, categoryTag nullable, exercises: array с резолвленными полями + exerciseName); `templateListResponseSchema`. Реэкспорт. TDD. Commit `feat(shared): контракты workout-templates`.

### Task B3: templates repo + service + routes + module + тесты

Эталон `clients`. Специфика (агрегат: шаблон + позиции):

- **repo** scoped по `trainerId` (templates персональные): create (в транзакции: insert template + insert template_exercises позиции 0..n; проверка, что все exerciseId видимы тренеру — личные или глобальные); getForTrainer (join template + exercises + имена упражнений); listByTrainer; update (в транзакции: апдейт шапки; если переданы exercises — удалить старые позиции и вставить новые); delete (cascade удалит позиции). Все проверяют `trainer_id`.
- **service**: 404 на чужой/несуществующий; валидация, что упражнения существуют и видимы (иначе 400/404 — описать как `AppError(400,'UNKNOWN_EXERCISE')`).
- **routes** `requireAuth`: GET list, GET :id, POST, PATCH :id, DELETE :id.
- **module** + подключение.
- **тесты:** repo.itest (создание с позициями; список упражнений резолвится; isolation по trainer); service.test (404, неизвестное упражнение→ошибка); routes.itest (CRUD); isolation.itest (B не видит/не правит шаблон A → 404).

- [ ] **Step 1–5:** repo+itest; service+test; routes+module+app.ts+itest; isolation; check. Commits аналогично Части A.

---

## Часть C — Client-workouts (тренировка клиента: упражнения + подходы + жизненный цикл)

> Самый сложный модуль. Тренировка принадлежит паре (тренер, клиент); вложена под клиента → доступ через `requireClientAccess` + scope `trainerId`.

### Task C1: Схема `client_workouts` + `client_workout_exercises` + `client_workout_sets` + миграция

- [ ] **Step 1: Таблицы (`schema.ts`)**

```ts
export const clientWorkouts = pgTable('client_workouts', {
  id: text('id').primaryKey(),
  trainerId: text('trainer_id')
    .notNull()
    .references(() => trainers.id, { onDelete: 'cascade' }),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  sourceTemplateId: text('source_template_id').references(() => workoutTemplates.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  status: text('status')
    .$type<'draft' | 'active' | 'completed' | 'skipped'>()
    .notNull()
    .default('draft'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationSec: integer('duration_sec'),
  trainerNote: text('trainer_note'),
  rpe: integer('rpe'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clientWorkoutExercises = pgTable(
  'client_workout_exercises',
  {
    workoutId: text('workout_id')
      .notNull()
      .references(() => clientWorkouts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
  },
  (t) => [primaryKey({ columns: [t.workoutId, t.position] })],
);

export const clientWorkoutSets = pgTable(
  'client_workout_sets',
  {
    workoutId: text('workout_id').notNull(),
    exercisePosition: integer('exercise_position').notNull(),
    setIndex: integer('set_index').notNull(),
    plannedReps: integer('planned_reps'),
    plannedWeightKg: doublePrecision('planned_weight_kg'),
    plannedTimeSec: integer('planned_time_sec'),
    plannedRestSec: integer('planned_rest_sec'),
    actualReps: integer('actual_reps'),
    actualWeightKg: doublePrecision('actual_weight_kg'),
    actualTimeSec: integer('actual_time_sec'),
    done: integer('done').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.workoutId, t.exercisePosition, t.setIndex] }),
    foreignKey({
      columns: [t.workoutId, t.exercisePosition],
      foreignColumns: [clientWorkoutExercises.workoutId, clientWorkoutExercises.position],
    }).onDelete('cascade'),
  ],
);
```

> Добавить импорт `foreignKey`. Статус — `$type<...>()`.

- [ ] **Step 2–5:** миграция `0005_*`; schema.itest (создать тренировку с упражнением и подходами, каскад при удалении); Docker-прогон; check; commit `feat(api): схема client_workouts (+ exercises/sets), миграция`.

### Task C2: Контракты client-workouts

- [ ] `packages/shared/src/client-workouts.ts`:
  - `workoutStatusSchema = z.enum(['draft','active','completed','skipped'])`.
  - `createWorkoutRequestSchema`: `{ name, sourceTemplateId?, exercises: array({ exerciseId, sets: array({ plannedReps?, plannedWeightKg?, plannedTimeSec?, plannedRestSec? }) }).min(1) }` (план тренировки).
  - `updateSetRequestSchema`: `{ actualReps?, actualWeightKg?, actualTimeSec?, done? }` (фиксация факта по подходу).
  - `completeWorkoutRequestSchema`: `{ durationSec?, trainerNote?, rpe? (1..10) }`.
  - `workoutResponseSchema`: id, clientId, name, status, startedAt nullable string, completedAt nullable string, durationSec nullable, trainerNote nullable, rpe nullable, exercises: array({ position, exerciseId, exerciseName, sets: array({ setIndex, planned*, actual*, done }) }).
  - `workoutListResponseSchema`.
    Реэкспорт. TDD. Commit `feat(shared): контракты client-workouts`.

### Task C3: client-workouts repo + service + routes + module + тесты

Самая объёмная задача. Вложен под клиента → роуты вида `/api/clients/:id/workouts...` с `[requireAuth, requireClientAccess]`.

- **repo** `makeClientWorkoutsRepo(db)` (всё scoped по `trainerId` И `clientId`):
  - `create(trainerId, clientId, plan)`: транзакция — insert client_workouts (status draft) + exercises (позиции) + sets (planned). Проверка, что exerciseId видимы тренеру (личные/глобальные).
  - `listForClient(trainerId, clientId)`: тренировки пары, сорт по createdAt desc.
  - `getFull(trainerId, clientId, workoutId)`: тренировка + вложенные упражнения + подходы (или null).
  - `start(trainerId, clientId, workoutId)`: status active + startedAt (только если принадлежит паре; null если нет).
  - `updateSet(trainerId, clientId, workoutId, position, setIndex, patch)`: апдейт факта подхода (с проверкой принадлежности тренировки паре); null если не найдено.
  - `complete(trainerId, clientId, workoutId, { durationSec, trainerNote, rpe })`: status completed + completedAt.
  - `remove(trainerId, clientId, workoutId)`: delete (cascade), boolean.
    Принадлежность: каждый метод джойнит/фильтрует `client_workouts WHERE id = :workoutId AND trainer_id = :trainerId AND client_id = :clientId`.
- **service**: `notFound` на отсутствие; create валидирует упражнения; статусные переходы (start только из draft; complete из active — иначе `AppError(409,'BAD_STATUS')`); сборка `workoutResponse`.
- **routes** (вложены под клиента, оба preHandler `[requireAuth, requireClientAccess]`):
  - POST `/api/clients/:id/workouts` (создать план, 201)
  - GET `/api/clients/:id/workouts` (список)
  - GET `/api/clients/:id/workouts/:wid` (полная)
  - POST `/api/clients/:id/workouts/:wid/start`
  - PATCH `/api/clients/:id/workouts/:wid/exercises/:pos/sets/:idx` (фиксация факта)
  - POST `/api/clients/:id/workouts/:wid/complete`
  - DELETE `/api/clients/:id/workouts/:wid`
    > `requireClientAccess` читает `params.id` (clientId) — совместимо. `:wid` принадлежность проверяется в repo (scope trainerId+clientId → 404 через service).
- **module** `registerClientWorkoutsModule(app,{db,clock})` + подключение.
- **тесты:**
  - repo.itest: create с упражнениями/подходами; getFull резолвит вложенность; start/updateSet/complete; isolation (другой тренер/клиент не видит → null).
  - service.test (мок repo типизирован): 404; статус-переходы (start из не-draft → 409; complete из не-active → 409); валидация упражнений.
  - routes.itest: полный флоу — создать план → start → updateSet (done) → complete → get показывает факт и status completed.
  - isolation.itest: тренер B (даже связанный со СВОИМ клиентом) не видит/не меняет тренировку клиента тренера A → 404; доступ к тренировке чужого клиента → 404; без auth → 401.

- [ ] **Step 1:** repo + repo.itest (Docker PASS).
- [ ] **Step 2:** service + service.test (статус-переходы, 404/409).
- [ ] **Step 3:** routes + module + app.ts + routes.itest (полный флоу плана→факт→завершение, Docker PASS).
- [ ] **Step 4:** isolation.itest (Docker PASS).
- [ ] **Step 5:** `npm run check` → 0. Commits: `feat(api): client-workouts.repo (scoped trainer+client)`, `feat(api): client-workouts.service (жизненный цикл)`, `feat(api): client-workouts-роуты (план→факт→завершение)`, `test(api): isolation-тесты client-workouts`.

---

## Часть D — Sessions (занятия-календарь)

### Task D1: Схема `sessions` + миграция

- [ ] **Step 1: Таблица (`schema.ts`)**

```ts
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    workoutId: text('workout_id').references(() => clientWorkouts.id, { onDelete: 'set null' }),
    date: text('date').notNull(), // YYYY-MM-DD
    startTime: text('start_time').notNull(), // HH:MM
    durationMin: integer('duration_min').notNull().default(60),
    location: text('location'),
    title: text('title'),
    status: text('status')
      .$type<'planned' | 'completed' | 'cancelled'>()
      .notNull()
      .default('planned'),
    isOnline: integer('is_online').notNull().default(0),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_sessions_trainer_date').on(t.trainerId, t.date)],
);
```

> Добавить импорт `index`. (Таблица называется `sessions` — не путать с `sessions_auth`.)

- [ ] **Step 2–5:** миграция `0006_*`; schema.itest; Docker; check; commit `feat(api): схема sessions (календарь), миграция`.

### Task D2: Контракты sessions

- [ ] `packages/shared/src/sessions.ts`: `sessionStatusSchema = z.enum(['planned','completed','cancelled'])`; `createSessionRequestSchema` (clientId, date (regex YYYY-MM-DD), startTime (regex HH:MM), durationMin default 60, location?, title?, isOnline default false, workoutId?); `updateSessionRequestSchema` (partial + status); `sessionResponseSchema`; `sessionListResponseSchema`. Реэкспорт. TDD. Commit `feat(shared): контракты sessions`.

### Task D3: sessions repo + service + routes + module + тесты

Эталон `clients`. Sessions scoped по `trainerId`; при создании/изменении с `clientId` — проверка связи тренера с клиентом (через clients repo `isLinked` или join), иначе 400/404.

- **repo** `makeSessionsRepo(db)` (scoped по trainerId): create (проверка, что clientId связан с тренером); listByTrainer (опц. фильтр по диапазону дат `?from&?to`); getForTrainer; update; remove. Все `WHERE trainer_id`.
- **service**: 404 на чужую/несуществующую; при create/update с clientId — проверка связи (иначе `AppError(400,'CLIENT_NOT_LINKED')`).
- **routes** `requireAuth`: GET /api/sessions (список, опц. ?from&to), GET /api/sessions/:id, POST, PATCH /api/sessions/:id, DELETE /api/sessions/:id. (Sessions — верхнеуровневый календарь тренера, не вложен под клиента; clientId в теле.)
- **module** + подключение.
- **тесты:** repo.itest (create со связанным клиентом ок; список по диапазону дат); service.test (404; несвязанный клиент → 400); routes.itest (CRUD); isolation.itest (B не видит/не правит занятие A → 404; нельзя создать занятие на чужого клиента).

- [ ] **Step 1–5:** repo+itest; service+test; routes+module+app.ts+itest; isolation; check. Commits аналогично.

---

## Definition of Done (Фаза 4)

- `npm run check` зелёный; все `*.itest.ts` проходят против Docker-Postgres.
- **Exercises:** список = личные + глобальные; CRUD только личных; глобальные/чужие нельзя править/удалять (404); миграция 0003.
- **Templates:** CRUD личных шаблонов с упорядоченными упражнениями; неизвестное/невидимое упражнение отклоняется; миграция 0004.
- **Client-workouts:** план → start → фиксация факта по подходам → complete; статус-переходы валидируются (409 на недопустимый); вложены под клиента (`requireClientAccess`); миграция 0005.
- **Sessions:** CRUD занятий тренера; нельзя завести занятие на несвязанного клиента; фильтр по диапазону дат; миграция 0006.
- **Изоляция доказана** для всех модулей: тренер B → 404 на доменные сущности тренера A; без auth → 401; repo фильтрует по `trainerId` (+ `clientId` для вложенных).
- Общий провайдер `clock` (newId/now); все роуты валидируются Zod-схемами; границы слоёв (eslint) держатся.

## Перенос в Фазу 5 (фиксируется здесь)

- Модули `packages` (оплаты), `accounting` (expenses/incomes), `measurements`, `chat` (polling) — по тому же эталону.
- Глобальные шаблоны тренировок (`trainer_id IS NULL`) — если потребуется.
- Сид глобального каталога упражнений (наполнение системных записей) — отдельная задача.
- CHECK-констрейнты на enum-поля (status тренировок/занятий) — defense-in-depth (перенос).
- Per-worker schema для параллелизма itest (перенос из Фазы 3) — становится актуальнее с ростом числа itest.
