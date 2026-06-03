# Статистика клиентского приложения — дизайн

**Дата:** 2026-06-03
**Раздел:** `apps/web-client` → «Статистика» (5-я секция после Тренировки/Профиль/Чат/Календарь).
**Связано:** [[project_web_client_app]]; паттерн фасадов — `2026-06-03-web-client-foundation-design.md`.

## Цель

Клиент видит свою тренировочную и телесную статистику в том же экране, что и тренер
(`apps/web/src/pages/ClientStatsPage.tsx`), по своим данным. Единый дашборд: отдельной секции
«Прогресс» не будет — замеры тела сведены сюда.

## Решения (зафиксированы в брейншторме)

1. **Единый дашборд**: тренировки + замеры в одном экране; «Прогресс» как отдельная секция
   не выделяется.
2. **Как у тренера**: зеркалим `ClientStatsPage` — табы и графики те же.
3. **Замеры — полный CRUD клиентом**: клиент сам добавляет/редактирует/удаляет свои замеры
   (вес, % жира, обхваты). Самологирование между тренировками — естественно.
4. **Фото прогресса — отложено**: файловый сторадж привязан к тренеру (`files.trainerId` notNull);
   нужен обобщённый сторадж под владельца-аккаунт + защищённая раздача для клиента. v1 без фото.
5. **v1 = 2 таба**: Упражнения + Замеры (тренерский 3-й таб «Фото» опущен).

## Подход

**Порт тренерского экрана + новый фасад замеров.** Приложения не импортируют друг друга
(раздельный деплой), поэтому переиспользуемая логика копируется в `apps/web-client`:
`lib/workout-stats.ts` (чистые агрегации), `components/LineChart.tsx`, `components/HoldToDelete.tsx`.
Тренировочные данные уже доступны через существующий фасад `client-app-workouts` (список
возвращает полные `exercises` с `exerciseName` и подходами). Для замеров — новый фасад
`client-app-measurements` поверх существующего доменного сервиса `measurements`.

## Архитектура

### Бэкенд

**Фасад `client-app-measurements`** (5-й, паттерн `makeClientScope`)
Переиспользует существующий доменный сервис `measurements` (методы уже принимают `(trainerId, clientId, …)`):

- `GET /api/client/measurements` → `{ measurements }` (через `scope(req)` → `svc.list(trainerId, clientId)`).
- `POST /api/client/measurements` body `createMeasurementRequestSchema` → `{ measurement }`
  (через `svc.create(trainerId, clientId, data)`).
- `PATCH /api/client/measurements/:mid` body `updateMeasurementRequestSchema` → `{ measurement }`
  (через `svc.update(trainerId, clientId, mid, patch)`).
- `DELETE /api/client/measurements/:mid` → `{ ok: true }` (через `svc.remove(trainerId, clientId, mid)`).
- Регистрируется в `app.ts` рядом с прочими `client-app-*`, `resolveScope: (id) => clientAuthSvc.resolveScope(id)`.
- 409 NOT_LINKED для непривязанного; 401 без `client_sid`; чужой/несуществующий замер → 404
  (скоуп `trainerId+clientId+mid` в repo `measurements`).

**Без изменений схемы/миграций** — таблица `measurements` уже существует. Тренировки —
существующий `client-app-workouts`, новый бэкенд не нужен.

### Клиентский фронт (`apps/web-client`)

**Порт переиспользуемого**

- `src/lib/workout-stats.ts` — копия `apps/web/src/lib/workout-stats.ts` (чистые функции:
  `aggregateExerciseOverview`, `aggregateExerciseHistory`, `workoutRowStats`, типы). Без изменений.
- `src/lib/workout-stats.test.ts` — копия теста (проверка скопированной логики).
- `src/components/LineChart.tsx` — копия (SVG-график, без внешних зависимостей). Без изменений.
- `src/components/HoldToDelete.tsx` — копия (hold-to-confirm удаление). Проверить её зависимости
  и при необходимости перенести их тоже.

**API-хуки (`src/api/measurements.ts`)**

- `useClientMeasurements()` — `GET /api/client/measurements`, 409→`[]` (как `useClientWorkouts`).
- `useCreateMeasurement()` / `useUpdateMeasurement()` / `useDeleteMeasurement()` — мутации,
  инвалидируют ключ списка замеров.
- Тренировки — существующий `useClientWorkouts()` из `src/api/workouts.ts`.

**Экран (`src/pages/StatsPage.tsx`)** — зеркало `ClientStatsPage`, клиент-скоупленное (без `clientId` из URL):

- Заголовок «Статистика», 2 таба: **Упражнения** / **Замеры** (таб «Фото» опущен).
- **Упражнения**: `aggregateExerciseOverview(workouts)` → список строк (PR/тоннаж/тренд) →
  тап → деталь с `ChartCard` (прогрессия тоннажа/макс-веса или времени) + таблица истории.
  Источник — `useClientWorkouts()`.
- **Замеры**: блок «Аналитика» (графики `LineChart` по выбранной метрике: вес/талия/грудь/бёдра/
  % жира + мини-карта тоннажа по тренировкам) + карточки замеров + форма создания/редактирования
  с удалением (`HoldToDelete`). CRUD — клиентские хуки замеров.
- `ChartCard`, `Toggle`, `MeasurementForm`, `NumField`, `FormGroup` и форматтеры — переносятся
  в составе экрана (как в оригинале).
- Непривязанный клиент (409): графики пусты, кнопка «Новый замер» скрыта, показывается
  приглашение «Подключите тренера» (как в других секциях). Глобальный `ConnectBanner` уже сверху.
- Маршрут `/progress` → `StatsPage` в `App.tsx` (вместо `StubPage`). Лейбл вкладки в `BottomNav`
  остаётся «Прогресс» (иконка TrendingUp) — навигацию не трогаем.

### Тренерская сторона

Не меняется. `ClientStatsPage` остаётся источником-образцом.

## Поток данных

1. Клиент открывает «Прогресс» → `StatsPage`.
2. Таб «Упражнения»: `useClientWorkouts()` → `aggregateExerciseOverview` → строки; тап →
   `aggregateExerciseHistory(workouts, exerciseId)` → графики.
3. Таб «Замеры»: `useClientMeasurements()` → аналитика + карточки; добавление/правка →
   `POST/PATCH /api/client/measurements` → инвалидация списка.

## Обработка ошибок

- Непривязанный: `scope` → 409 → хуки отдают `[]`; форма замера скрыта, показывается приглашение.
- CRUD чужого/несуществующего замера: repo `null` → сервис `notFound` → 404; форма показывает ошибку.
- Сетевые ошибки списков: состояние ошибки на соответствующем табе.

## Тестирование

- **Isolation itest (только `trener_test`)** для `client-app-measurements`:
  - без `client_sid` → 401; непривязанный → 409;
  - клиент видит лишь свои замеры (не чужого клиента того же тренера);
  - `POST` создаёт замер под скоупом клиента; `PATCH`/`DELETE` чужого замера → 404.
- **Порт `workout-stats.test.ts`** в web-client — проверка скопированной логики агрегаций.
- `npm run check` зелёный; unit-тесты web-client проходят.

## Вне scope

- Фото прогресса (обобщение файлового стораджа — отдельный под-проект).
- Изменения тренерского `ClientStatsPage`.
- Серверная агрегация статистики (считаем на клиенте из уже отдаваемых данных).
