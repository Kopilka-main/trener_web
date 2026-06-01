# Фаза 5: Домен 2 — packages, accounting, measurements, chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ещё четыре доменных модуля + закрытие технического долга Фазы 4: оплаты (пакеты тренировок), бухгалтерия (расходы/доходы/залы + сводка), замеры тела клиента, чат (на стороне тренера, polling). Всё — по эталону Фаз 3–4 (repo scoped по `trainerId`, вложенные под клиента через `requireClientAccess`, split routes/module, isolation-тесты, type-provider).

**Architecture:** Каждый модуль — `apps/api/src/modules/<m>/` (repo/service/routes/module + тесты), Zod-контракты в `@trener/shared`. `packages` и `measurements` вложены под клиента (`/api/clients/:id/...`, `[requireAuth, requireClientAccess]`). `accounting` (expenses/incomes/gyms/summary) и `chat` — верхнеуровневые у тренера (scoped по `trainerId`; для записей с `clientId` — проверка связи). Только тренер (клиентских аккаунтов нет): в чате `sender_role='trainer'`, клиентская сторона — будущий клиентский апп.

**Tech Stack:** Fastify 5, Drizzle ORM, PostgreSQL, Zod (type-provider), Vitest. Всё из Фаз 1–4.

**Решения по объёму:** все 4 модуля; поля минимальные-расширяемые; chat — только тренерская сторона (отправка/листинг сообщений тренером); accounting summary — суммы за период (доход/расход/баланс).

---

## Эталоны (в репозитории, следовать точно)

- Стандартный CRUD scoped по trainerId: `apps/api/src/modules/exercises/` (личный каталог), `apps/api/src/modules/sessions/` (с проверкой связи клиента `isClientLinked`).
- Вложенный под клиента + агрегат/жизненный цикл: `apps/api/src/modules/client-workouts/` (репо scoped по trainer+client, вложенные роуты `/api/clients/:id/...` с `[requireAuth, requireClientAccess]`).
- Базовый CRUD под клиента: `apps/api/src/modules/clients/`.
- Провайдер `clock` — `apps/api/src/core/app-deps.ts` (прокидывается через module → service).
- Конвенции: ветка фазы, `core.autocrlf=false`+LF; Conventional Commits (subject нижний регистр), тело через файл БЕЗ BOM + `git commit -F`; НЕ `--no-verify`; itest skipIf без `DATABASE_URL`, гонять с Docker-Postgres; `npm run check` без БД = exit 0; type-provider-схемы на каждом роуте; границы слоёв (`*.routes.ts` без repo/db) держит ESLint.

---

## Task 0: Hardening (закрытие carry-forward Фазы 4)

**Files:** Modify exercises.service/repo, client-workouts.repo/service, schema.ts (+migration), app.ts, packages/shared/src/sessions.ts.

- [ ] **Step 1: `exercises.delete` FK-violation → 409.** В `exercises.repo.delete` (или service) ловить ошибку PG с кодом `23503` (foreign_key_violation) и возвращать сигнал → service бросает `AppError(409,'EXERCISE_IN_USE','Упражнение используется в шаблоне или тренировке')`. Тест: создать упражнение + шаблон с ним → DELETE упражнения → 409 (не 500). Прогнать против Docker.
- [ ] **Step 2: Атомарные статус-переходы client-workouts.** `setStatusActive`/`complete` в repo — добавить условие статуса в `WHERE` (`AND status = 'draft'` / `AND status = 'active'`) и возвращать affected-rows; service: убрать TOCTOU (читать → проверять → писать), вместо этого вызвать атомарный апдейт и по affected-rows различать 404 (нет) vs 409 (неверный статус) — потребует от repo вернуть достаточно инфы (например, `'updated' | 'not_found' | 'bad_status'`). Сохранить существующие 404/409-тесты зелёными.
- [ ] **Step 3: CHECK-констрейнты на enum-статусы.** Миграция: добавить CHECK на `trainer_clients.status IN ('active','archived')`, `client_workouts.status IN ('draft','active','completed','skipped')`, `sessions.status IN ('planned','completed','cancelled')`. Через Drizzle — `check()` в определении таблицы (потребует `db:generate` → новая миграция). Прогнать миграцию против Docker.
- [ ] **Step 4: auth → общий clock.** В `app.ts` auth-модуль переключить с инлайн `randomUUID`/`new Date()` на `realClock` (или прокинуть `clock` в auth-wiring). Убрать импорт `randomUUID` из `app.ts`, если больше не нужен.
- [ ] **Step 5: `updateSessionRequestSchema` без default.** В `packages/shared/src/sessions.ts` убедиться, что update-схема не тащит `.default(60)` для durationMin (если `.partial()` наследует — переопределить `durationMin` в update как `z.number().int().positive().optional()` без default).
- [ ] **Step 6:** `npm run check` → 0; целевые itest против Docker зелёные. Commit (можно несколькими): `fix(api): exercises.delete → 409 при использовании`, `refactor(api): атомарные статус-переходы client-workouts`, `feat(api): CHECK-констрейнты на enum-статусы (миграция)`, `refactor(api): auth на общий clock`, `fix(shared): убрать default durationMin в update sessions`.

---

## Часть A — Packages (пакеты оплат, под клиента)

### Task A1: схема `payment_packages` + миграция

- [ ] Таблица `paymentPackages` (`schema.ts`): id PK; trainerId notNull FK→trainers cascade; clientId notNull FK→clients cascade; lessonsPaid integer notNull; pricePerLesson doublePrecision notNull; totalPaid doublePrecision notNull; workoutType text nullable; startsAt text notNull (YYYY-MM-DD); status `$type<'active'|'closed'|'cancelled'>()` notNull default 'active' (+CHECK); note nullable; createdAt; индекс (trainerId, clientId). Миграция; schema.itest. Docker-прогон. Commit.

### Task A2: контракты packages (`@trener/shared/packages.ts`)

- [ ] createPackageRequestSchema (lessonsPaid int positive, pricePerLesson positive, totalPaid positive, workoutType? nullish, startsAt date-regex, note? nullish); updatePackageRequestSchema (partial + status); packageResponseSchema; packageListResponseSchema; типы. Реэкспорт. TDD. Commit.

### Task A3: repo+service+routes+module+тесты (под клиента)

- [ ] По эталону `client-workouts` (scoped по trainer+client): repo create/listForClient/getForTrainer/update/remove; service (404; create); routes под `/api/clients/:id/packages...` с `[requireAuth, requireClientAccess]` (POST 201, GET list, GET :pid, PATCH :pid, DELETE :pid); module + app.ts; тесты repo.itest/service.test(типизир. мок)/routes.itest/isolation.itest (B→404). `npm run check`+Docker. Commits (repo/service/routes/isolation).

---

## Часть B — Accounting (expenses + incomes + gyms + summary)

### Task B1: схемы `gyms`, `expenses`, `incomes` + миграция

- [ ] `gyms` (id PK; trainerId notNull FK cascade; name notNull; monthlyRent doublePrecision nullable; note nullable; createdAt). `expenses` (id PK; trainerId notNull FK cascade; category text notNull; amount doublePrecision notNull; date text notNull; gymId nullable FK→gyms set null; clientId nullable FK→clients set null; note nullable; createdAt; индекс (trainerId,date)). `incomes` (id PK; trainerId notNull FK cascade; category text notNull; amount doublePrecision notNull; date text notNull; note nullable; createdAt; индекс (trainerId,date)). Миграция; schema.itest. Docker. Commit.

### Task B2: контракты accounting (`@trener/shared/accounting.ts`)

- [ ] createGym/updateGym; createExpense (category, amount positive, date-regex, gymId? nullish, clientId? nullish, note?)/updateExpense partial; createIncome/updateIncome; response-схемы gym/expense/income + списки; `accountingSummaryResponseSchema` ({ from, to, totalIncome, totalExpense, balance }); типы. Реэкспорт. TDD. Commit.

### Task B3: модуль accounting (repo+service+routes+module+тесты)

- [ ] По эталону exercises/sessions (scoped по trainerId, верхнеуровневый). Один модуль `accounting` с repo, покрывающим gyms/expenses/incomes (методы scoped по trainerId; expense.gymId/clientId — проверка принадлежности тренеру/связи клиента → 400 при чужом). Service + `summary(trainerId, {from,to})` (суммы доход/расход/баланс за период). Routes (requireAuth): CRUD `/api/gyms`, `/api/expenses` (фильтр ?from&to), `/api/incomes` (фильтр), GET `/api/accounting/summary?from&to`. module + app.ts. Тесты: repo.itest, service.test(типизир. мок; summary; чужой gym/клиент→400), routes.itest, isolation.itest (B не видит expenses/incomes/gyms A → 404/пусто; summary только своё). `npm run check`+Docker. Commits.

---

## Часть C — Measurements (замеры тела, под клиента)

### Task C1: схема `measurements` + миграция

- [ ] `measurements` (id PK; trainerId notNull FK cascade; clientId notNull FK cascade; date text notNull; weightKg doublePrecision nullable; bodyFatPct doublePrecision nullable; chestCm/waistCm/hipsCm doublePrecision nullable; note nullable; createdAt; индекс (trainerId,clientId,date)). (Минимальный набор — расширяемо.) Миграция; schema.itest. Docker. Commit.

### Task C2: контракты measurements

- [ ] createMeasurementRequestSchema (date-regex; числовые поля nullish positive); updateMeasurementRequestSchema partial; measurementResponseSchema; list; типы. Реэкспорт. TDD. Commit.

### Task C3: модуль measurements (под клиента)

- [ ] По эталону client-workouts/clients (scoped по trainer+client, вложен под клиента). repo create/listForClient (сорт по date)/getForTrainer/update/remove; service (404); routes `/api/clients/:id/measurements...` `[requireAuth, requireClientAccess]`; module+app.ts; тесты (repo.itest/service.test/routes.itest/isolation.itest B→404). `npm run check`+Docker. Commits.

---

## Часть D — Chat (conversations + messages, сторона тренера, polling)

> Только тренер: тренер пишет/читает сообщения в диалоге клиента. Клиентская сторона (приём/отправка клиентом) — будущий клиентский апп. `sender_role` фиксируется как `'trainer'` для сообщений, создаваемых в этой фазе; колонка оставлена расширяемой.

### Task D1: схемы `conversations` + `messages` + миграция

- [ ] `conversations` (id PK; trainerId notNull FK cascade; clientId notNull FK cascade; lastMessageAt timestamptz nullable; trainerLastReadAt timestamptz nullable; createdAt; UNIQUE (trainerId, clientId)). `messages` (id PK; conversationId notNull FK→conversations cascade; senderRole text `$type<'trainer'|'client'>()` notNull; body text notNull; createdAt; индекс (conversationId, createdAt)). Миграция; schema.itest. Docker. Commit.

### Task D2: контракты chat

- [ ] sendMessageRequestSchema (body trim min1 max4000); messageResponseSchema (id, senderRole, body, createdAt string); conversationResponseSchema (id, clientId, lastMessageAt nullable, unreadForTrainer? — опускаем в MVP); conversationListResponseSchema; messageListResponseSchema; типы. Реэкспорт. TDD. Commit.

### Task D3: модуль chat (под клиента / тренерский)

- [ ] repo (scoped по trainer+client): `getOrCreateConversation(trainerId, clientId)` (по UNIQUE), `listConversations(trainerId)` (диалоги тренера, сорт по lastMessageAt desc), `listMessages(trainerId, clientId, {sinceId?|limit})` (polling), `addMessage(trainerId, clientId, body, senderRole='trainer', now)` (создать диалог при отсутствии, вставить сообщение, обновить lastMessageAt), `markRead(trainerId, clientId, now)`. service (404 на чужого клиента — связь через requireClientAccess; getOrCreate). routes: GET `/api/conversations` (список диалогов тренера, requireAuth); под клиента `[requireAuth, requireClientAccess]`: GET `/api/clients/:id/messages` (листинг, polling — опц. ?sinceId), POST `/api/clients/:id/messages` (отправить, 201), POST `/api/clients/:id/messages/read` (отметить прочитанным). module+app.ts. Тесты: repo.itest (getOrCreate идемпотентен; addMessage обновляет lastMessageAt; листинг), service.test, routes.itest (отправка→листинг показывает сообщение), isolation.itest (B не видит диалог/сообщения клиента A → 404/пусто). `npm run check`+Docker. Commits.

---

## Definition of Done (Фаза 5)

- `npm run check` зелёный; все itest проходят против Docker-Postgres.
- **Hardening:** exercises.delete используемого → 409; статус-переходы client-workouts атомарны; CHECK на enum-статусах; auth на общем clock; durationMin без default в update.
- **Packages:** CRUD пакетов под клиента; статус active/closed/cancelled.
- **Accounting:** CRUD gyms/expenses/incomes; summary доход/расход/баланс за период; чужой gym/несвязанный клиент в expense → 400.
- **Measurements:** CRUD замеров под клиента; сортировка по дате.
- **Chat:** тренер создаёт диалог/шлёт/листит сообщения; список диалогов; mark-read; polling по ?sinceId.
- **Изоляция** доказана для всех 4 модулей (B→404; без auth→401); миграции согласованы (журнал).

## Перенос в Фазу 6 (фиксируется здесь)

- Файлы: `@fastify/multipart`, защищённый роут раздачи `GET /api/files/:id`, таблица `files`, progress-photos (фото прогресса под клиента), медкарта (файлы+заметки). Volume `/data/uploads`.
- Клиентская сторона чата (приём/отправка клиентом) — когда появится клиентский апп.
- Расширение полей measurements (полный набор обхватов) — по надобности.
