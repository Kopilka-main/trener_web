# Свои тренировки клиента — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps — checkbox (`- [ ]`).

**Goal:** Клиент создаёт свою тренировку из базы знаний, проводит (фиксирует подходы) и завершает; самостоятельные тренировки личные (тренер не видит), запускать можно только свои.

**Architecture:** Миграция `client_workouts.created_by_client`. Домен `client-workouts`: флаг владельца в create, фильтр владельца в списке, owned-only мутации. Расширение фасада `client-app-workouts` (create/start/updateSet/complete/delete). Фронт: список своих+тренерских, создание из каталога, компактный экран проведения.

**Спека:** `docs/superpowers/specs/2026-06-04-web-client-own-workouts-design.md`.

**Образцы:** `apps/api/src/modules/client-workouts/*` (домен), `apps/api/src/modules/client-app-workouts/*` (фасад), `apps/web-client/src/pages/KnowledgePage.tsx` (выбор/фильтр упражнений), `apps/web/src/pages/ActiveWorkoutPage.tsx` (референс логики проведения — НЕ копировать целиком).

---

## Соглашения

- `*.itest.ts` — только trener_test (контроллер). Миграцию генерит/применяет контроллер. Сабагент: typecheck/unit/build, НЕ docker/БД.
- В дереве чужая WIP — коммить ТОЛЬКО свои файлы (`git add <путь>`). Conventional Commits, без `--no-verify`; subject не с заглавной аббревиатуры.

---

## Task 1: Бэкенд — владелец + фасад своих тренировок

**Files:** `apps/api/src/db/schema.ts`; `packages/shared/src/client-workouts.ts`; `apps/api/src/modules/client-workouts/{client-workouts.repo.ts,client-workouts.service.ts,client-workouts.routes.ts}`; `apps/api/src/modules/client-app-workouts/{client-app-workouts.routes.ts,client-app-workouts.module.ts}`; `apps/api/src/modules/client-workouts/client-workouts.service.test.ts`; новый `apps/api/src/modules/client-app-workouts/client-app-own-workouts.isolation.itest.ts`.

- [ ] **Step 1: Схема.** В `clientWorkouts` (`schema.ts`) после `rpe` добавить:
  ```ts
  createdByClient: boolean('created_by_client').notNull().default(false),
  ```
  Проверить импорт `boolean` из drizzle-orm/pg-core (если нет — добавить).
- [ ] **Step 2: Миграция (контроллер).** `npm run db:generate -w apps/api` → ALTER add column; применить к trener+trener_test.
- [ ] **Step 3: Контракт.** `packages/shared/src/client-workouts.ts`: `workoutResponseSchema` += `createdByClient: z.boolean()`.
- [ ] **Step 4: repo.**
  - `WorkoutRow` += `createdByClient: boolean`; в `cols`/маппинге добавить.
  - `create(trainerId, clientId, plan, createdByClient = false)` — писать колонку.
  - `listForClient(trainerId, clientId, owner: 'trainer' | 'all' = 'all')` — при `'trainer'` добавить `eq(createdByClient, false)`; иначе без фильтра. (Сохранить сортировку.)
  - Мутации `setStatusActive/updateSet/complete/remove/addExercise/removeExercise` — добавить опц. параметр `ownedByClientOnly = false`; при `true` условие выборки/обновления требует `createdByClient = true` (как уже скоупится по trainerId+clientId+id, дописать `and(eq(createdByClient, true))`), чтобы тренерскую клиент не тронул (вернуть null/'not_found').
  - `getFull(...)` уже возвращает строку — убедиться, что включает `createdByClient`.
- [ ] **Step 5: service.**
  - `create(t,c,input, createdByClient = false)` → `repo.create(..., createdByClient)`.
  - `list(t,c, owner: 'trainer'|'all' = 'all')` → `repo.listForClient(t,c,owner)`.
  - `start/updateSet/complete/remove/addExercise` → проброс `ownedByClientOnly`.
  - `toResponse` добавляет `createdByClient`.
- [ ] **Step 6: Тренерские routes/usage.** В `client-workouts.routes.ts` тренерский список — `svc.list(trainerId, clientId, 'trainer')` (тренер не видит самостоятельные). Остальные тренерские вызовы — `ownedByClientOnly` НЕ передаётся (по умолчанию false — поведение цело).
- [ ] **Step 7: Фасад.** В `client-app-workouts.routes.ts` (через `makeClientScope`):
  - изменить список: `svc.list(trainerId, clientId, 'all')`.
  - `POST /api/client/workouts` (body `createWorkoutRequestSchema`, 201 `{workout}`) → `svc.create(t,c,body,true)`.
  - `POST /api/client/workouts/:wid/start` → `svc.start(t,c,wid,{ownedByClientOnly:true})`.
  - `PATCH /api/client/workouts/:wid/sets/:setId` (body `updateSetRequestSchema`) → `svc.updateSet(..., ownedByClientOnly:true)`.
  - `POST /api/client/workouts/:wid/complete` (body `completeWorkoutRequestSchema`) → `svc.complete(..., ownedByClientOnly:true)`.
  - `DELETE /api/client/workouts/:wid` → `svc.remove(..., ownedByClientOnly:true)` → `{ok:true}`.
  - (Сверить точные сигнатуры мутаций сервиса и параметры по факту; routes не импортируют repo.)
- [ ] **Step 8: Unit + типы.** Обновить `client-workouts.service.test.ts` фикстуры (createdByClient в row, новые методы/параметры в fakeRepo); добавить кейсы (list owner-фильтр; ownedByClientOnly не трогает тренерскую). `npm run typecheck -w apps/api`, `npm run test -w apps/api -- client-workouts`.
- [ ] **Step 9: Isolation itest** (контроллер) `client-app-own-workouts.isolation.itest.ts`: клиент POST workout → start → PATCH set → complete (200, статусы); GET `/api/client/workouts` содержит её; тренерский `GET /api/clients/:id/workouts` её НЕ содержит; клиент start/delete тренерской → 404; без `client_sid` → 401.
- [ ] **Step 10: commit** — `feat(api): свои тренировки клиента (владелец + фасад create/run/complete)`.

---

## Task 2: Фронт — список, создание из базы знаний, проведение

**Files:** `apps/web-client/src/api/workouts.ts` (хуки); `apps/web-client/src/pages/WorkoutsListPage.tsx` (переработка); new `apps/web-client/src/pages/CreateWorkoutPage.tsx`, `apps/web-client/src/pages/RunWorkoutPage.tsx`; `apps/web-client/src/App.tsx` (маршруты). Тесты рядом.

- [ ] **Step 1: Хуки** в `api/workouts.ts`: `useCreateWorkout` (`POST /client/workouts`), `useStartWorkout` (`POST /client/workouts/:id/start`), `useUpdateWorkoutSet` (`PATCH /client/workouts/:id/sets/:setId`), `useCompleteWorkout` (`POST /client/workouts/:id/complete`), `useDeleteWorkout` (`DELETE /client/workouts/:id`). Все инвалидируют `clientWorkoutsQueryKey` (+ деталь). Стиль — как существующие client-хуки (apiFetch body/schema).
- [ ] **Step 2: `WorkoutsListPage` (переработка):**
  - `useClientWorkouts()` теперь возвращает свои + тренерские (любой статус у своих).
  - Секция «Активные/черновики» (свои `draft`/`active`) сверху: карточка с действием «Продолжить» (active → `/workouts/:id/run`) или «Начать» (draft → start → run); «Удалить» (HoldToDelete) для своих незавершённых.
  - Секция «Завершённые» (свои + тренерские `completed`), бейдж «своя»/«от тренера» (по `createdByClient`), тап → `/workouts/:id` (деталь).
  - Кнопка **«Новая тренировка»** → `/workouts/new` (видна привязанному; непривязанному — приглашение подключить).
- [ ] **Step 3: `CreateWorkoutPage` (`/workouts/new`):**
  - имя (инпут, дефолт напр. «Моя тренировка»);
  - выбор упражнений из каталога (`useClientExercises` + фильтр группы/подгруппы как в KnowledgePage; можно вынести общий компонент-список, но допустимо повторить); добавленные упражнения — список с плановыми подходами: число подходов (+/−, 1..N), повторы/вес (дефолты из упражнения `defaultReps/defaultWeightKg/defaultTimeSec`, редактируемо);
  - «Создать» → `useCreateWorkout` payload `{ name, exercises: [{exerciseId, sets:[{plannedReps,plannedWeightKg,plannedTimeSec}]}] }` → onSuccess `useStartWorkout(id)` → `navigate('/workouts/'+id+'/run')`.
  - Валидация: ≥1 упражнение, у каждого ≥1 подход (как требует контракт).
- [ ] **Step 4: `RunWorkoutPage` (`/workouts/:wid/run`):**
  - `useClientWorkout(wid)` (деталь активной); если не active/не своя — сообщение/редирект.
  - по упражнениям и подходам: для каждого подхода — поля факта (повторы/вес, либо время если планировалось время) + кнопка «Готово» → `useUpdateWorkoutSet({wid, setId, input:{actualReps, actualWeightKg, done:true}})`; визуально отмечать done.
  - внизу «Завершить тренировку» (опц. RPE 1..10) → `useCompleteWorkout({wid, input:{rpe}})` → `navigate('/workouts/'+wid)`.
- [ ] **Step 5: Маршруты** в `App.tsx`: `/workouts/new` → CreateWorkoutPage; `/workouts/:wid/run` → RunWorkoutPage. (Порядок: `/workouts/new` и `/workouts/:wid/run` до `/workouts/:wid`.) Импорты.
- [ ] **Step 6: Проверки** — `npm run typecheck` (корень), `npm run test -w apps/web-client`, `npm run build -w @trener/web-client`. Тесты: список (секции свои/тренерские), создание (выбор→план→создать), run (лог подхода/завершение) — из мок-хуков.
- [ ] **Step 7: commit** — `feat(web-client): свои тренировки — создание из базы знаний и проведение`.

---

## Финал

- [ ] `npm run check` зелёный; сборка web-client зелёная.
- [ ] Контроллер: миграция (trener+trener_test); itest зелёный; пересборка docker api + web-client; live: клиент создаёт тренировку из базы знаний, проводит, завершает; в прогрессе/базе знаний появляется; тренер её не видит. Тестовые данные убрать.
- [ ] finishing-a-development-branch.

## Self-review (план против спеки)

- Миграция created_by_client → Task 1.1–1.2 ✓
- Контракт createdByClient → Task 1.3 ✓
- Домен: флаг в create, owner-фильтр списка, owned-only мутации → Task 1.4–1.6 ✓
- Тренер не видит самостоятельные (svc.list 'trainer') → Task 1.6 ✓
- Фасад create/start/updateSet/complete/delete (own only) → Task 1.7 ✓
- itest полного цикла + изоляции от тренера + 404/401 → Task 1.9 ✓
- Фронт: список свои/тренерские, создание из каталога, run, complete → Task 2 ✓
- Маршруты new/run; деталь без изменений → Task 2.5 ✓
- Сигнатуры: `svc.create(t,c,plan,createdByClient)`, `svc.list(t,c,owner)`, мутации `(... , {ownedByClientOnly})` — согласованы repo↔service↔фасад/тренер.
