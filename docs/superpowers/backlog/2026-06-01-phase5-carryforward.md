# Перенос в Фазу 5 (из ревью Фазы 4)

Зафиксировано по итогам code-review доменных модулей (Фаза 4). Не блокеры Фазы 4 — учесть при планировании Фазы 5 (модули: packages/оплаты, accounting, measurements, chat).

## Корректность / надёжность

1. **`exercises.delete` → FK-violation → 500.** Удаление личного упражнения, на которое ссылается шаблон (`workout_template_exercises`) или тренировка (`client_workout_exercises`), падает с PG FK-ошибкой (`ON DELETE no action`) → generic 500. Замапить в дружественный `AppError(409,'EXERCISE_IN_USE')` (ловить код PG `23503` в service/repo).
2. **TOCTOU на статус-переходах client-workouts.** `start`/`complete` читают `getFull`, проверяют статус, затем отдельным `update` пишут — между ними возможна гонка. Сделать переход атомарным: `UPDATE ... WHERE id=? AND trainer_id=? AND client_id=? AND status=:expected` с проверкой affected rows; убрать предварительный read.
3. **`updateSet` без статус-гейта.** Факт подхода можно записать в `draft`/`completed` тренировку. Если инвариант «факт только между start и complete» нужен — гейтить по `status='active'`.
4. **CHECK-констрейнты на enum-статусы** (перенос+расширение): `trainer_clients.status`, `client_workouts.status`, `sessions.status` — добавить БД-CHECK как defense-in-depth (сейчас только `$type` + Zod).
5. **`durationMin` default в `updateSessionRequestSchema`.** `.partial()` наследует `.default(60)` — латентная хрупкость (сейчас не протекает из-за поведения Zod partial). Явно убрать default в update-схеме.

## Тесты / инфра

6. **Per-worker schema для параллелизма itest** (перенос из Фаз 3-4): `fileParallelism: false` сериализует itest; с ростом числа тестов вернуть параллелизм через изоляцию БД (per-worker `search_path` по `VITEST_POOL_ID`).
7. **Усечение длинных имён FK-констрейнтов** (`client_workout_sets_..._fk` > 63 симв.) — Postgres усекает с NOTICE. При необходимости задать явные короткие `.constraintName()`.

## Архитектура

8. **Перенести auth на общий `clock`** (перенос из Task 0 Фазы 4): auth-модуль в `app.ts` ещё использует инлайн `randomUUID`/`new Date()`; переключить на `realClock`, убрать импорт `randomUUID` из `app.ts`.
9. **Дублирование пустого-патча в repo.update** (exercises): вынести в локальный `getOwn`-хелпер (как `clients`/`sessions`).
10. **Семантика `null` в update** различается между модулями: clients (null=не трогать) vs exercises (null=очистка). Задокументировать выбранную политику и придерживаться при новых модулях.

## Прямо в объёме Фазы 5 (из spec)

11. **Модули** `payment_packages` (оплаты), `accounting` (expenses/incomes), `measurements` (замеры тела), `chat` (conversations/messages, polling) — по эталону доменных модулей Фазы 3-4.
12. **Сид глобального каталога упражнений** (наполнение системных записей `trainer_id IS NULL`).
13. **Расширение полей** (клиент: дата рождения/рост/контакты; упражнение: target_muscles/equipment; занятие: note в create) — по мере надобности.
14. **Глобальные шаблоны тренировок** (`trainer_id IS NULL`) — если потребуется.
