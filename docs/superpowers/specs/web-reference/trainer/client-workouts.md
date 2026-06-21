# Тренировки клиента — ClientWorkoutsPage.tsx

**Маршрут:** `/clients/:id/workouts` · **Точки входа:** карточка клиента → раздел «Тренировки»
**Назначение:** список тренировок клиента глазами тренера — «ближайшая» (черновик/активная) сверху, ниже история по датам; точки входа в создание/повтор/ретро-запись.

## Макет (сверху вниз)

1. **ScreenHeader** `Тренировки · <Имя Фамилия>` (или просто «Тренировки», пока клиент не загружен), кнопка назад → `/clients/:id`.
2. **Секция «Ближайшая тренировка»** (mono-кикер):
   - Если есть тренерский черновик/активная (`current[0]`) → **CurrentCard** (`bg-card`): название (18px bold), мета «N упр.»+ « · идёт» для active; кнопка-плашка `bg-accent` «Начать тренировку» / «Продолжить» (если active). Тап по карточке → редактор `/clients/:id/workouts/:wid`.
   - Иначе → **EmptyCurrent** (пунктирная рамка): круглая `+` (создать пустой черновик), текст «Тренировка не запланирована», acid-кнопка «Выбрать из базы» (template-пикер), ссылка «или повторить из истории» (disabled, если истории нет).
3. **Секция «История тренировок · N»** (если `history.length>0`): группы по дате (новые сверху), заголовок группы — mono `ДД/ММ/ГГГГ` (`text-accent-text`). В группе — **HistoryRow** на каждую тренировку.
4. **Кнопка «Добавить в историю»** (пунктир, во всю ширину): открывает **HistoryComposeSheet** (ретро-запись).
5. **Шиты (портал, поверх):** TemplatePickerSheet / HistoryPickerSheet / HistoryComposeSheet.

## Данные

| Поле                  | Источник                                                                                      | Формат   |
| --------------------- | --------------------------------------------------------------------------------------------- | -------- |
| заголовок             | `useClient(id)` → firstName/lastName                                                          | строка   |
| список тренировок     | `useClientWorkouts(id)` → `WorkoutResponse[]`                                                 | —        |
| `current` (ближайшая) | `isCurrent(w)` (`status==='active'\|\|'draft'`) **И** `!createdByClient`; active раньше draft | карточка |
| `history`             | `!isCurrent(w)` (completed/skipped), сорт по `completedAt ?? startedAt` ↓                     | список   |
| `historyGroups`       | группировка истории по `(completedAt??startedAt).slice(0,10)`                                 | по дате  |
| HistoryRow мета       | skipped → «Пропущена»; иначе `formatDuration(durationSec)` · `RPE n` · `N упр.`               | mono     |
| бейдж «клиентская»    | `w.createdByClient`                                                                           | chip     |
| раскрытие строки      | `expandedId` — список упражнений `exerciseSummary(ex)` + `trainerNote` в кавычках             | —        |

`WorkoutResponse`: `id, clientId, name, status('draft'|'active'|'completed'|'skipped'), startedAt, completedAt, durationSec, trainerNote, rpe, createdByClient, excludedFromBalance, exercises[]`. `exercises[]`: `position, exerciseId, exerciseName, sets[]`. `sets[]`: `setIndex, plannedReps/WeightKg/TimeSec/RestSec, actualReps/WeightKg/TimeSec, done`.

## Действия

- **Тап CurrentCard / Начать-Продолжить** → навигация в редактор `/clients/:id/workouts/:wid` (без мутации; запуск тренировки происходит уже там).
- **«+» (EmptyCurrent)** / «Создать новую» в шитах → `createEmpty()` → **POST** `/api/clients/:id/workouts` `{name:'Новая тренировка', exercises:[]}` → новый черновик → переход в редактор.
- **«Выбрать из базы»** → TemplatePickerSheet → выбор шаблона → `assignTemplate(t)`: **POST** `/api/clients/:id/workouts` с `{name, sourceTemplateId, exercises}` — плоская модель: каждый из `ex.sets` шаблона разворачивается в **отдельное упражнение с одним подходом** (`plannedReps/WeightKg/TimeSec/RestSec` из шаблона). Переход в редактор.
- **«или повторить из истории» / RotateCcw в HistoryRow / HistoryPickerSheet** → `repeat(w)`: клон ВЫПОЛНЕННЫХ подходов (`s.done`) в новый черновик; план берётся из факта (`actualReps ?? plannedReps`…); упражнения без выполненных подходов отбрасываются; если выполненного нет — no-op. **POST** `/api/clients/:id/workouts`. Повтор в HistoryRow — через **HoldToConfirm** (1500 мс).
- **«Добавить в историю»** → HistoryComposeSheet → любой из 3 вариантов, но с `excludedFromBalance:true` (`pickerExcluded`/`createEmpty(true)`) → черновик-история; финализируется в редакторе («Добавить в историю» с датой).

Все мутации — `useCreateWorkout` (инвалидирует `['clients',id,'workouts']`).

## Состояния

- **loading**: «Загрузка…».
- **error**: «Не удалось загрузить тренировки. Попробуйте обновить страницу.» (`role=alert`).
- **success без ближайшей**: EmptyCurrent.
- **success без истории**: секция истории и кнопка «Добавить в историю» — кнопка показывается всегда при success; секция истории скрыта.
- В шите «повторить» строки с `exercises.length===0` — disabled.

## Навигация

карточка/начать/создать/шаблон/повтор → `/clients/:id/workouts/:wid` · назад → `/clients/:id`.

## Бизнес-правила и edge-cases

- **«Ближайшая» — только тренерские** (`!createdByClient`); клиентские самостоятельные тренировки идут только в историю (с бейджем «клиентская»).
- **excludedFromBalance** (ретро-запись): не уменьшает баланс пакета, нет в календаре, клиент не уведомляется. Применяется только к тренерским записям.
- **repeat = «точь-в-точь как провели»**: факт становится новым планом, пропущенные подходы/упражнения исключаются.
- `formatGroupDate`: `YYYY-MM-DD` → `ДД/ММ/ГГГГ`; «unknown» → «Без даты».
- `setSummary` показывает факт, если есть, иначе план; `exerciseSummary` префиксит `N×` при нескольких подходах.

## Сводка эндпоинтов

- `GET /api/clients/:id/workouts` — список тренировок (`useClientWorkouts`).
- `GET /api/clients/:id` — клиент для заголовка.
- `GET /api/templates` — шаблоны (только в TemplatePickerSheet, `useTemplates`).
- `POST /api/clients/:id/workouts` — создать тренировку (пустую/из шаблона/повтор); body `CreateWorkoutRequest {name, sourceTemplateId?, exercises[], excludedFromBalance?}` → `{workout}`.
