# Свои тренировки клиента — дизайн

**Дата:** 2026-06-04
**Раздел:** `apps/web-client` → `/workouts` (клиент сам создаёт и проводит тренировку из базы знаний).
**Связано:** [[project_web_client_app]]; опирается на «Базу знаний» v2 (каталог упражнений) и домен `client-workouts`.

## Цель

Клиент может **создать свою тренировку** из упражнений базы знаний, **провести** её (зафиксировать
подходы) и **завершить** — самостоятельно, без тренера. Самостоятельные тренировки **личные** (тренер
их не видит); запускать можно **только свои**.

## Решения (зафиксированы в брейншторме)

1. **Личные:** новый признак владельца на `client_workouts` (`createdByClient`). Тренер в своём списке
   клиента самостоятельные тренировки НЕ видит; клиент видит свои (любой статус) + тренерские завершённые.
2. **Только свои:** клиент может стартовать/логировать/завершать/удалять только `createdByClient=true`.
3. Экран проведения — **новый компактный клиентский**, не порт тренерского `ActiveWorkoutPage`.

## Архитектура

### Схема + миграция (новая, напр. 0030)

- `client_workouts.createdByClient boolean NOT NULL DEFAULT false`. Существующие/тренерские → false
  (поведение тренера не меняется); клиентские самостоятельные → true.

### Домен `client-workouts` (repo + service)

- `create(trainerId, clientId, plan, createdByClient = false)` — добавить флаг (тренерский путь
  по умолчанию false; колонку писать в insert).
- Список с фильтром владельца: `listForClient(trainerId, clientId, owner: 'trainer' | 'all')`
  (или эквивалентный параметр). `'trainer'` → только `createdByClient=false`; `'all'` → все.
  - Тренерский `service.list` → `'trainer'` (тренер перестаёт видеть самостоятельные клиента).
    ⚠️ Это меняет поведение тренерского `GET /api/clients/:id/workouts` — обновить вызов сервиса.
  - Клиентский фасад → `'all'` (свои + тренерские).
- Признак владельца в ответе: `WorkoutResponse` += `createdByClient: boolean` (контракт `@trener/shared`),
  чтобы фронт различал «своя»/«от тренера».
- Защита «только свои» для клиентских мутаций: либо доменные методы принимают `requireClientOwned`,
  либо клиентский фасад перед мутацией проверяет `getFull(...).createdByClient === true` (иначе 404).
  Выбор: **флаг в доменных мутациях** (`start/updateSet/complete/remove/addExercise`) — опц.
  `ownedByClientOnly?: boolean`, при true и `createdByClient=false` → возврат как «не найдено».

### Фасад `client-app-workouts` (расширение)

Текущие `GET /api/client/workouts` (список, теперь `owner='all'`) и `GET /api/client/workouts/:wid` —
остаются. Добавить (все через `makeClientScope`, мутации — только свои):

- `POST /api/client/workouts` — `createWorkoutRequestSchema` → `svc.create(t, c, plan, true)` → draft.
- `POST /api/client/workouts/:wid/start` → `svc.start(..., ownedByClientOnly)` (draft→active).
- `PATCH /api/client/workouts/:wid/sets/:setId` — `updateSetRequestSchema` → `svc.updateSet(...)` (own).
- `POST /api/client/workouts/:wid/complete` — `completeWorkoutRequestSchema` → `svc.complete(...)` (own).
- `DELETE /api/client/workouts/:wid` → `svc.remove(...)` (own).
- Isolation itest: клиент создаёт → стартует → логирует → завершает свою; тренер НЕ видит её в
  `GET /api/clients/:id/workouts`; клиент не может стартовать/удалить тренерскую (404); без сессии 401.

### Клиентский фронт (`apps/web-client`)

- **`/workouts` (`WorkoutsListPage`, переработка):** заголовок + кнопка **«Новая тренировка»**
  (→ `/workouts/new`); список: незавершённые свои (draft/active) сверху (бейдж «своя», действие
  «Продолжить»/«Начать»), затем завершённые (свои + тренерские, бейдж источника), тап по завершённой →
  деталь. Непривязанный — приглашение подключить (создавать нельзя).
- **`/workouts/new` (`CreateWorkoutPage`):** имя; выбор упражнений из **базы знаний** (хук
  `useClientExercises` + фильтр группы/подгруппы как в `/knowledge`); по упражнению — плановые подходы
  (кол-во подходов +/−, повторы/вес из дефолтов упражнения, редактируемо); «Создать» →
  `POST /api/client/workouts` → затем `start` → переход на `/workouts/:wid/run`.
- **`/workouts/:wid/run` (`RunWorkoutPage`, новый компактный):** упражнения и подходы активной
  тренировки; по каждому подходу — поля факта (повторы/вес или время) + кнопка «Готово»
  (`PATCH .../sets/:setId`); внизу «Завершить» (опц. RPE) → `complete` → переход в деталь/список.
- **Хуки** (`api/workouts.ts`): `useCreateWorkout`, `useStartWorkout`, `useUpdateWorkoutSet`,
  `useCompleteWorkout`, `useDeleteWorkout` — инвалидируют список тренировок + прогресс/базу знаний.
- Деталь завершённой (`/workouts/:wid`, `WorkoutDetailPage`) — без изменений (read-only).
- Маршруты `/workouts/new`, `/workouts/:wid/run` в `App.tsx`. Навигация назад — `BackFab`.

## Поток данных

1. `/workouts/new`: выбрать упражнения из каталога → собрать план → `POST /workouts` (draft, createdByClient)
   → `POST /start` → `/workouts/:wid/run`.
2. `/run`: `PATCH /sets/:id` по мере выполнения; `POST /complete` → завершено.
3. Завершённые свои попадают в прогресс/базу знаний (как и тренерские completed — агрегации это учитывают).

## Обработка ошибок / граничные

- Непривязанный (409): создание недоступно (нет trainerId-скоупа), приглашение подключить.
- Мутация чужой/тренерской → 404; неверный статус (старт не из draft, complete не из active) → понятное
  сообщение (домен уже даёт `bad_status`).
- Без красного текста; деструктив (удалить черновик) — через подтверждение/`HoldToDelete`.

## Тестирование

- Domain unit: `create` пишет флаг; `list(owner)` фильтрует; мутации с `ownedByClientOnly` не трогают
  тренерские.
- Isolation itest (trener_test): полный цикл клиента; тренер не видит; чужое → 404; 401 без сессии;
  регрессия тренерского списка (видит только свои).
- Frontend: создание (выбор из каталога → план), run (лог подхода, завершение), список (свои/тренерские),
  пустые/непривязан. `npm run check` + сборка зелёные.

## Вне scope (v1)

- Шаблоны тренировок, переупорядочивание упражнений, добавление упражнения в активную (можно позже).
- Запуск клиентом тренировок, назначенных тренером.
- Полный порт тренерского `ActiveWorkoutPage` (делаем свой простой экран).
- Таймеры отдыха/звук.
