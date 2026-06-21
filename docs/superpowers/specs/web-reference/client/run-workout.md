# Проведение тренировки — RunWorkoutPage.tsx

**Маршрут:** `/workouts/:wid/run` · **Точки входа:** ContinueCard / выбор шаблона / повтор из истории (WorkoutsListPage).
**Назначение:** единый экран жизненного цикла своей тренировки — редактируемый план (`DraftView`), запуск, лог подходов с таймером отдыха, завершение (`ActiveView`). Каталог упражнений добавляется/убирается прямо здесь.

Экран выбирает вид по `workout.status`:

- `draft` → **DraftView** (план + «Начать»).
- `active` → **ActiveView** (чек-лист + таймер + завершение).
- `completed`/`skipped` → `<Navigate replace to="/workouts/:wid">` (итоги, см. workout-detail.md).

---

## Полный цикл (E2E)

1. **Создать свою тренировку** — на списке: «Выбрать из базы»/«Повторить» → `POST /api/client/workouts` (status=`draft`) → переход сюда (DraftView). Тренировка может быть пустой.
2. **Редактировать план (DraftView):** drag-перестановка, добавить/убрать упражнения из каталога (пикер), редактировать плановые значения подхода (повторы/вес/время/отдых), удержание корзины — убрать упражнение.
3. **Старт:** «Начать тренировку» → `POST /api/client/workouts/:wid/start` (`draft → active`) → редирект на `/workouts/:wid/run` (теперь ActiveView).
4. **Лог подходов (ActiveView):** отметка ✓ (с автозаполнением факта из плана) либо ручной ввод факта; запуск **таймера отдыха** после отметки/сохранения, если `plannedRestSec > 0`.
5. **Завершение:** кнопка «Завершить» → подтверждение → `POST /api/client/workouts/:wid/complete` (`active → completed`) → редирект `/workouts/:wid` (итоги).

---

## Макет — DraftView (status=draft)

1. Ссылка-назад «‹ Тренировки» (→ `/workouts`).
2. Заголовок = имя тренировки (`font-display`, 24px) + подпись «План тренировки. Нажмите „Начать", чтобы провести.».
3. **SortableList упражнений** (drag за ручку `GripVertical`):
   - Заголовок упражнения (метка `exerciseLabels`) + `HoldToDelete` (корзина → убрать упражнение).
   - Подходы: mono-текст `plannedText` («12 × 50 кг 60 с») + кнопка `Pencil`. Тап карандаша → `PlannedSetEditor` (4 поля: Повторы / Вес, кг / Время, с / Отдых, с).
4. **AddExerciseButton** «+ Добавить упражнение» (пунктир) → `ExercisePickerSheet`.
5. **Нижняя зафиксированная панель** (`fixed inset-x-0 bottom-0`): акцентная кнопка «Начать тренировку» (disabled и текст «Добавьте упражнение», если упражнений нет; «Запускаем…» во время мутации).

## Макет — ActiveView (status=active)

1. Ссылка-назад «‹ Тренировки».
2. Заголовок = имя тренировки.
3. **Сводка (`tile-shadow-primary`):** слева «Прошло» + `formatDuration(elapsed)` (тикает 1/с от `startedAt`); справа — либо **RestTimer** (если идёт отдых), либо **HoldComplete** (pill «Завершить»).
4. **Коллектор «Завершено · N»:** кнопка-аккордеон; справа счётчик `done / total подходов` + `ChevronDown`. Развёрнуто — карточки завершённых упражнений (`opacity-80`).
5. **SortableList невыполненных упражнений** (`pending`): для каждого — карточка с подходами:
   - Текст: факт (`actualText`), если есть, иначе план (`plannedText`), mono 19px.
   - Кнопка `Pencil` → `SetEditor` (3 поля: Повторы / Вес, кг / Время, с + сохранить ✓ / отмена ✕ / `HoldToDelete` упражнения).
   - Кнопка `Check` (✓): отметить/снять; акцентный fill, если `done`.
6. **AddExerciseButton** «+ Добавить упражнение».
7. Если упражнения есть и все выполнены (`pending.length === 0`) — большая блочная кнопка **HoldComplete** «Завершить».

## Данные

| Поле                    | Источник                                                                                           | Формат                              |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `workout`               | `useClientWorkout(wid)` → `WorkoutResponse`                                                        | —                                   |
| `elapsed`               | `useElapsed(startedAt)` (Date.now − startedAt, тик 1с)                                             | `formatDuration` `M:SS` / `H:MM:SS` |
| счётчики                | `done/total` по всем `sets` (flatMap)                                                              | «3 / 10 подходов»                   |
| `completed` / `pending` | упражнения, где все подходы `done` / нет                                                           | две секции                          |
| каталог (пикер)         | `useClientExercises()` → `ExerciseResponse[]`, отфильтрован по «базе знаний»                       | список                              |
| фильтр пикера           | `aggregateExerciseOverview(useClientWorkouts())` → множество `exerciseId` с проведённых тренировок | только знакомые упражнения          |

## Действия (метод путь, тело → ответ)

| Жест                                                              | API                                               | Тело → ответ                                                                                                                                                    | Прим.                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| «Начать тренировку»                                               | `POST /api/client/workouts/:wid/start`            | (нет тела) → `{workout}` (active, проставлен `startedAt`)                                                                                                       | `startedRef=true`, редирект на `/run`                                                                 |
| Drag-перестановка (SortableList)                                  | `PATCH /api/client/workouts/:wid/exercises`       | `{order: number[]}` (текущие `position` в новом порядке) → `{workout}`                                                                                          | оптимистично `withReordered` в кэш до запроса                                                         |
| «+ Добавить упражнение» → тап в пикере                            | `POST /api/client/workouts/:wid/exercises`        | `{exerciseId, sets:[{plannedReps?, plannedWeightKg?, plannedTimeSec?, plannedRestSec?}]}` (один подход из дефолтов упражнения, `buildPlannedSet`) → `{workout}` | повторный тап того же — убирает                                                                       |
| Убрать упражнение (повторный тап / корзина / удалить в SetEditor) | `DELETE /api/client/workouts/:wid/exercises/:pos` | → `{workout}`                                                                                                                                                   | `:pos` = `position`                                                                                   |
| Сохранить план подхода (PlannedSetEditor)                         | `PATCH /api/client/workouts/:wid/sets/:setId`     | `{plannedReps, plannedWeightKg, plannedTimeSec, plannedRestSec}` (nullable) → `{workout}`                                                                       | `:setId` = `"<position>:<setIndex>"`                                                                  |
| Отметить подход ✓ (`toggleDone`)                                  | `PATCH /api/client/workouts/:wid/sets/:setId`     | `{done:true[, actualReps, actualWeightKg, actualTimeSec]}` → `{workout}`                                                                                        | при первой отметке факт автозаполняется из плана; оптимистичный патч `withSetPatch` в View Transition |
| Снять отметку                                                     | тот же PATCH                                      | `{done:false}`                                                                                                                                                  | факт не трогается                                                                                     |
| Сохранить факт (SetEditor)                                        | `PATCH /api/client/workouts/:wid/sets/:setId`     | `{actualReps, actualWeightKg, actualTimeSec, done:true}` → `{workout}`                                                                                          | после успеха — запуск отдыха, если `plannedRestSec>0`                                                 |
| «Завершить» (подтверждение)                                       | `POST /api/client/workouts/:wid/complete`         | `{durationSec: elapsed>0?elapsed:null, rpe:null}` → `{workout}` (completed)                                                                                     | редирект `/workouts/:wid`                                                                             |
| Уход из DraftView без «Начать»                                    | `DELETE /api/client/workouts/:wid`                | → `{ok}`                                                                                                                                                        | в `useEffect`-cleanup, только если `!startedRef`                                                      |

Все мутации инвалидируют префикс `['client','workouts']` (покрывает список, деталь, прогресс, базу знаний) + деталь `['client','workouts',wid]`.

## Таймер отдыха (RestTimer)

- Запускается из `toggleDone` (после отметки) и из `saveFact` (после сохранения факта), если `set.plannedRestSec && > 0`. Ключ — `"<position>-<setIndex>"`.
- Обратный отсчёт 1/с от `plannedRestSec`; круговой SVG-прогресс (`stroke-dashoffset`), цифра по центру, метка «Отдых».
- По истечении — `onDone` (сбрасывает `rest=null`); крестик `✕` — `onSkip` (досрочно).
- Пока идёт отдых, в сводке вместо HoldComplete показан RestTimer.

## Завершение (HoldComplete)

- Кнопка «Завершить» (pill в сводке или блочная внизу) → открывает `ConfirmDialog` («Завершить тренировку?» / «Завершить») → `onComplete` = `finishWorkout` → `complete.mutate(...)`. Имя обманчиво: это тап + подтверждение, не «удержание».

## Пикер упражнений (ExercisePickerSheet)

- Bottom-sheet (`fixed inset-0`, `useBackClose`). Заголовок «Добавить упражнение».
- Поиск по имени (input + крестик очистки).
- Чипы групп мышц (`PickerChip`, порядок `PICKER_GROUP_ORDER`: Грудь, Спина, Ноги, Плечи, Руки, Корпус, Пресс/Кор, Кардио, Растяжка, Йога + прочие по алфавиту) и подгрупп (`orderSubgroups`).
- Список: чекбокс (✓ если уже в тренировке — `selected` по `exerciseId`), миниатюра (`PickerThumb`: `thumbUrl ?? imageUrl`, фолбэк `Dumbbell`), имя + «категория · подгруппа», кнопка `Info` → `ExerciseInfoModal` (фото, оборудование/целевые/доп. мышцы, описание).
- Тап строки: не выбрано → `onAdd`; выбрано → `onRemove` (toggle).
- **Фильтр доступности:** только упражнения из «базы знаний» клиента — те, что встречались на проведённых тренировках (`aggregateExerciseOverview`). Незнакомых нет.

## Drag-перестановка (SortableList / @dnd-kit)

- Перетаскивание за ручку `GripVertical`; только вертикальный сдвиг (`x:0`). Сенсоры: Pointer (порог 6px), Touch (задержка 180ms).
- `onReorder` → пересбор `order` из `position` элементов → оптимистично `withReordered` в кэш → `reorder.mutate`.
- В ActiveView переставляются только `pending`; завершённые держатся в начале `order` (`[...completed.position, ...next.position]`).

## Состояния

- **loading:** «Загрузка…». **error:** «Тренировка не найдена.» + ссылка «К списку».
- **draft пустой:** кнопка «Добавьте упражнение» (disabled).
- **active, все подходы done:** появляется большая блочная кнопка «Завершить».
- **completed/skipped:** редирект на деталь.

## Бизнес-правила и edge-cases

- **Точные поля редакторов.** `PlannedSetEditor` (draft) — 4 поля: `plannedReps`, `plannedWeightKg`, `plannedTimeSec`, `plannedRestSec`. `SetEditor` (active) — 3 поля факта: `actualReps`, `actualWeightKg`, `actualTimeSec` (+ `done:true` при сохранении). Ввод парсится `num()`: пусто → `null`, нечисло → `null`.
- **`buildPlannedSet`** (дефолты при добавлении): если у упражнения `defaultTimeSec` — берётся время; иначе `defaultReps`/`defaultWeightKg`; плюс `restSec → plannedRestSec`.
- **`setId` всегда составной** `"<position>:<setIndex>"` — позиция упражнения + индекс подхода.
- **Автозаполнение факта:** при первой отметке ✓, если факт пуст, копируется план (`actualReps←plannedReps` и т.д.) и отправляется вместе с `done`.
- **Удаление черновика** при уходе — через ref (`delRef`/`startedRef`), чтобы временные превью не накапливались. После «Начать» (`startedRef=true`) тренировка сохраняется.
- **View Transition:** отметка ✓ оборачивается в `startViewTransition` (плавный перенос упражнения в «Завершено»), где API доступен.
- `complete` шлёт `durationSec = elapsed` (если >0) и `rpe = null` — **RPE из UI не задаётся** на этом экране (поле в API есть, но кнопкой не выставляется; запас на будущее/тренера).

## Сводка эндпоинтов

- `GET /api/client/workouts/:wid` — тренировка (поллинг через query-key).
- `GET /api/client/workouts` — для фильтра пикера (база знаний).
- `GET /api/client/exercises` — каталог упражнений.
- `POST /api/client/workouts/:wid/start` — запуск (draft→active).
- `PATCH /api/client/workouts/:wid/exercises` — перестановка (`{order}`).
- `POST /api/client/workouts/:wid/exercises` — добавить упражнение.
- `DELETE /api/client/workouts/:wid/exercises/:pos` — убрать упражнение.
- `PATCH /api/client/workouts/:wid/sets/:setId` — обновить план/факт/`done` подхода.
- `POST /api/client/workouts/:wid/complete` — завершить (`{durationSec, rpe}`).
- `DELETE /api/client/workouts/:wid` — удалить черновик при уходе.

## Расхождения мобайла (на момент составления)

- Свериться: составной `setId` `position:setIndex`, оптимистичные `withReordered`/`withSetPatch`, автозаполнение факта из плана при первой отметке.
- Свериться: таймер отдыха стартует и из toggleDone, и из saveFact; фильтр пикера по «базе знаний» (только знакомые упражнения); удаление черновика-превью при выходе без «Начать».
