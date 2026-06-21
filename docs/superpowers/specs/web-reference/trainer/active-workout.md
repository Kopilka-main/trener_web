# Проведение тренировки — ActiveWorkoutPage.tsx

**Маршрут:** `/clients/:id/workouts/:wid` · **Точки входа:** список тренировок клиента (CurrentCard / создание / повтор / ретро-запись)
**Назначение:** единый редактор тренировки с тремя режимами по `status`: **draft** (план + запуск/добавл. в историю), **active** (проведение: лог подходов, отдых, демонстрация), **completed/skipped** (сводка только для чтения).

## Роутинг по статусу

`useWorkout(id, wid)` → `WorkoutResponse`. Затем:

- `status==='draft'` → **DraftView**.
- `status==='active'` → **ActiveView**.
- иначе (`completed`/`skipped`) → **SummaryView**.

loading/error до выбора режима: ScreenHeader «Тренировка» + «Загрузка…» / «Не удалось загрузить тренировку.» (`role=alert`).

## Макет — DRAFT (план)

1. **ScreenHeader** `<name>`, назад → `/clients/:id/workouts`; справа **HoldToDelete** (удерж. → удалить тренировку).
2. **SortableList упражнений** (drag-перестановка): на упражнение — название (повторы нумеруются 1,2,3… через `exerciseLabels`), HoldToDelete (удалить упражнение), список подходов. Подход: mono-текст плана `plannedText(set)` (`8 × 60 кг 30 с` / «—») + карандаш → **PlannedSetEditor** (поля Повт./Кг/Сек/Отдых → сохранить/отменить).
3. **AddExerciseButton** (пунктир) → ExercisePickerSheet.
4. **Sticky-низ:**
   - Обычный черновик: кнопка **«Начать тренировку»** (disabled при `exercises.length===0`).
   - Историческая запись (`excludedFromBalance`): поле **«Дата тренировки»** (date, по умолч. сегодня) + кнопка **«Добавить в историю»** (disabled при пустых упражнениях/дате).

## Макет — ACTIVE (проведение)

1. **ScreenHeader** `<name>`, назад → список.
2. **Сводка-плитка** (`tile-shadow-primary`): «Прошло» + таймер `formatDuration(elapsed)` (тикает от `startedAt`); справа — либо **RestTimer** (если идёт отдых), либо **HoldComplete** (pill «Завершить»). Ниже — блок **«Следующий подход»** (если у следующего упражнения есть медиа): имя + план + DemoVideo/img с MediaToggle (видео/фото), сворачивается.
3. **Коллектор «Завершено · N»** (кнопка-аккордеон): счётчик `done/total подходов`; развёрнуто — все завершённые упражнения (`shelf`, opacity-80) через `cardBody`.
4. **SortableList невыполненных** упражнений (`cardBody`): на подход — mono факт/план; карандаш → **SetEditor**; круглая **Check** (отметить выполненным, acid-fill при done).
5. **AddExerciseButton** → ExercisePickerSheet.
6. Если все подходы выполнены (`pending.length===0`, упражнения есть) — большая **HoldComplete** (`variant='block'`).

## Макет — SUMMARY (только чтение)

ScreenHeader; **3 Stat**: Подходов `done/total`, Время `formatDuration(durationSec)` или «—», RPE `n/10` или «—». Заметка тренера (если есть). По каждому упражнению — карточка: подходы `Подход k` план `→` факт (факт `text-accent-text`, если `done`).

## Данные

| Поле                     | Источник                                                | Формат          |
| ------------------------ | ------------------------------------------------------- | --------------- |
| тренировка               | `useWorkout(id,wid)` → `WorkoutResponse`                | —               |
| `elapsed`                | `useElapsed(startedAt)` — сек с `startedAt`, тикает 1/с | mm:ss / h:mm:ss |
| подписи упражнений       | `exerciseLabels` — дубли имён нумеруются по `position`  | строка          |
| `plannedText/actualText` | reps `× weight кг` `time с`; пусто → «—»                | mono            |
| следующий подход         | первый невыполненный подход первого незавершённого упр. | —               |
| каталог упр.             | `useExercises()` → `exById` (для медиа демонстрации)    | —               |
| `counters`               | `{done, total}` по всем подходам                        | число           |

## Действия (метод + путь + тело → ответ)

Все возвращают `{workout}` и обновляют кэш `clientWorkoutQueryKey(id,wid)` (часть ещё инвалидирует список `['clients',id,'workouts']`).

- **Запустить** (DraftView «Начать») → `useStartWorkout` → **POST** `/api/clients/:id/workouts/:wid/start` (без тела). После → навигация на тот же URL (теперь active).
- **Добавить в историю** (DraftView, history) → `useAddWorkoutToHistory` → **POST** `/api/clients/:id/workouts/:wid/add-to-history` `{date:'YYYY-MM-DD'}` → назад в список.
- **Удалить тренировку** (header HoldToDelete) → `useDeleteWorkout` → **DELETE** `/api/clients/:id/workouts/:wid` → `{ok}` → назад в список.
- **Добавить упражнение** (обе ветки) → `useAddWorkoutExercise` → **POST** `/api/clients/:id/workouts/:wid/exercises` `{exerciseId, sets:[plannedSet]}` (один план-подход из дефолтов упражнения).
- **Удалить упражнение** (HoldToDelete / в SetEditor «корзина») → `useRemoveWorkoutExercise` → **DELETE** `/api/clients/:id/workouts/:wid/exercises/:position`.
- **Перестановка** (drag в SortableList) → оптимистично `withReordered` в кэш → `useReorderWorkoutExercises` → **PATCH** `/api/clients/:id/workouts/:wid/exercises` `{order:[position…]}`. В active порядок = `[...завершённые.position, ...невыполненные.position]`.
- **Правка плана** (PlannedSetEditor, draft) → `useUpdateSet` → **PATCH** `/api/clients/:id/workouts/:wid/exercises/:pos/sets/:idx` `{plannedReps, plannedWeightKg, plannedTimeSec, plannedRestSec}`.
- **Отметить выполненным** (active Check, `toggleDone`) → оптимистичный патч в кэш внутри View Transition → `useUpdateSet` **PATCH** …/sets/:idx `{done}`. Если факт пуст — копирует план в факт (`actualReps/WeightKg/TimeSec = planned*`). При `done` и `plannedRestSec>0` запускает RestTimer.
- **Правка факта** (SetEditor, active, `saveFact`) → **PATCH** …/sets/:idx `{actualReps, actualWeightKg, actualTimeSec, done:true}`; после — RestTimer, если `plannedRestSec>0`.
- **Завершить** (HoldComplete → ConfirmDialog) → `useCompleteWorkout` → **POST** `/api/clients/:id/workouts/:wid/complete` `{durationSec:(elapsed>0?elapsed:null), rpe:null, trainerNote:null}` → назад в список.

## Состояния

- **draft**: кнопка запуска/истории disabled при пустых упражнениях; ветка истории определяется `excludedFromBalance`.
- **active**: коллектор «Завершено» виден всегда; свёрнут — пуст, развёрнут — все завершённые; RestTimer вытесняет HoldComplete в шапке; финальный HoldComplete-block только когда все подходы сделаны.
- **completed/skipped**: только чтение, без мутаций.

## Навигация

назад → `/clients/:id/workouts`; запуск остаётся на `/clients/:id/workouts/:wid`; добавить-в-историю/завершить/удалить → список (`replace:true`).

## Бизнес-правила и edge-cases

- **Отметка «выполнено» без факта** копирует план в факт — иначе статистика пустая.
- **RestTimer** перемонтируется по `key=pos-idx`: новый отдых сбрасывает отсчёт даже при той же длительности; кнопка X пропускает отдых.
- **View Transition**: оптимистичная отметка подхода анимирует «уезд» карточки в коллектор (`runWithTransition`/`flushSync`, fallback — без анимации).
- **SetEditor** показывает поля по наличию плана: reps/× вес/· сек; вес — только если `plannedWeightKg!==null` и т.д.
- `excludedFromBalance` финализируется датой и не влияет на баланс/календарь (см. client-workouts.md).
- `plannedRestSec` границы 0…3600.

## Сводка эндпоинтов

- `GET /api/clients/:id/workouts/:wid` — тренировка.
- `GET /api/exercises` — каталог (медиа следующего подхода).
- `POST …/:wid/start` — запустить (draft→active).
- `POST …/:wid/add-to-history` `{date}` — зафиксировать ретро-запись.
- `POST …/:wid/complete` `{durationSec, rpe, trainerNote}` — завершить.
- `POST …/:wid/exercises` `{exerciseId, sets[]}` — добавить упражнение.
- `DELETE …/:wid/exercises/:pos` — удалить упражнение.
- `PATCH …/:wid/exercises` `{order[]}` — перестановка.
- `PATCH …/:wid/exercises/:pos/sets/:idx` `{planned*/actual*/done}` — правка плана/факта/отметка.
- `DELETE /api/clients/:id/workouts/:wid` — удалить тренировку.
