# Прогресс клиента — ClientStatsPage.tsx

**Маршрут:** `/clients/:id/stats` · **Точки входа:** карточка клиента → «Прогресс»
**Назначение:** статистика клиента в трёх табах: **Упражнения** (PR/тоннаж/тренд из завершённых тренировок), **Замеры** (тело + графики + запрос замеров), **Фото** (галерея прогресса).

## Макет (сверху вниз)

1. **ScreenHeader** `Прогресс · <Имя Фамилия>`, назад → `/clients/:id`.
2. **Табы** (`bg-chip`, сегмент-переключатель): Упражнения / Замеры / Фото (`tab` state, по умолч. `exercises`).
3. Тело таба.

### Таб «Упражнения»

- Список **ExerciseRow** из `aggregateExerciseOverview(workouts)`: имя, mono-мета — для весовых `PR <maxWeightKg> кг` + `тоннаж <formatTonnage>`, для временных `PR <время>` + `время`; `· <относит. дата>`. Иконка тренда `ArrowUp`(acid)/`ArrowDown` по `lastIsRecord`. Тап → **ExerciseDetail**.
- **ExerciseDetail**: «← Назад», переключатель «Только рекорды» (Toggle), 2 **ChartCard** (весовые: Тоннаж + Макс. вес; временные: Макс. время + Сумм. время) — SVG-line с курсором, дельта к первой сессии (acid при ≥0, danger при <0); **HistoryTable** (новые сверху).

### Таб «Замеры»

- Баннер задачи: если есть открытая задача — «Запрос на замеры отправлен» + «Отменить»; иначе пунктир-кнопка **«Запросить замеры у клиента»**.
- Пунктир-кнопка **«Новый замер»** → MeasurementForm.
- **MeasurementsAnalytics** (если есть замеры): чипы метрик (только с ≥2 значениями) + LineChart выбранной; ниже **TonnageChart** (тоннаж по завершённым тренировкам, если ≥2 точек).
- **MeasurementCard** на каждый замер: дата (`formatRuDate`), карандаш-правка, сетка заполненных полей, заметка.

### Таб «Фото»

- Панель загрузки: date + сегмент ракурса (Фас/Бок/Спина) + «Выбрать фото» (file).
- Группы по дате (новые сверху), сетка 3-в-ряд: img (`fileUrl(file.id)`), бейдж ракурса, HoldToDelete.

## Данные

| Поле               | Источник                                                                  | Формат    |
| ------------------ | ------------------------------------------------------------------------- | --------- |
| заголовок          | `useClient(id)`                                                           | строка    |
| обзор упражнений   | `aggregateExerciseOverview(useClientWorkouts.data)`                       | список    |
| история упражнения | `aggregateExerciseHistory(workouts, exerciseId)`                          | точки     |
| замеры             | `useClientMeasurements(id)` → `MeasurementResponse[]` (новые↑)            | список    |
| открытая задача    | `useClientMeasurementTasks(id)` → `tasks[0]` (бэк отдаёт только открытые) | —         |
| фото               | `useClientProgressPhotos(id)` → `PhotoResponse[]`                         | по дате   |
| тоннаж-график      | `workoutRowStats(w)` по `status==='completed'`                            | LineChart |

`MeasurementResponse`: `id, clientId, date, weightKg, bodyFatPct, bicepsCm, chestCm, underbustCm, waistCm, bellyCm, glutesCm, hipsCm, thighCm, calfCm, note, createdAt` (все метрики nullable). `PhotoResponse`: `id, clientId, date, angle('front'|'side'|'back'), note, file{id,...}, createdAt`.

## Действия (метод + путь + тело → ответ)

- **Запросить замеры** → `useCreateMeasurementTask` → **POST** `/api/clients/:id/measurement-tasks` `{note:null}` → `{task}`. Инвалидирует `measurement-tasks`.
- **Отменить запрос** → `useCancelMeasurementTask` → **DELETE** `/api/clients/:id/measurement-tasks/:tid` → `{ok}`.
- **Создать замер** (MeasurementForm) → `useCreateMeasurement` → **POST** `/api/clients/:id/measurements` `CreateMeasurementRequest {date:'YYYY-MM-DD', weightKg, bodyFatPct, biceps/chest/underbust/waist/belly/glutes/hips/thigh/calfCm, note}` (null = пусто) → `{measurement}`.
- **Изменить замер** → `useUpdateMeasurement` → **PATCH** `/api/clients/:id/measurements/:mid` (частично) → `{measurement}`.
- **Удалить замер** (HoldToDelete в форме) → `useDeleteMeasurement` → **DELETE** `/api/clients/:id/measurements/:mid` → `{ok}`.
- **Загрузить фото** → `useUploadProgressPhoto` → **POST** `/api/clients/:id/progress-photos` (**multipart/form-data**: `photo`=файл, `date`, `angle`, опц. `note`; Content-Type ставит браузер) → `{photo}`.
- **Удалить фото** (HoldToDelete) → `useDeleteProgressPhoto` → **DELETE** `/api/clients/:id/progress-photos/:pid` → `{ok}`.

Замеры/задачи/фото инвалидируют свои ключи. Упражнения и тоннаж-график только читают `useClientWorkouts`.

## Состояния

- **loading/error** в каждом табе свои («Загрузка…» / «Не удалось загрузить …», `role=alert`).
- **empty**: упражнения — «Клиент ещё не делал упражнений в проведённых тренировках»; замеры — «Замеров пока нет»; фото — «Фотографий пока нет».
- **MeasurementForm**: валидация даты (`YYYY-MM-DD`), ошибка сохранения — `text-danger`.
- Аналитика: метрика доступна только при ≥2 значениях; если выбранная стала недоступной — переключение на первую доступную; TonnageChart скрыт при <2 точках.

## Навигация

назад → `/clients/:id`. Внутри табов навигации между страницами нет (ExerciseDetail — внутреннее состояние).

## Бизнес-правила и edge-cases

- Обзор/история считаются **только по завершённым тренировкам** (`status==='completed'`).
- `lastIsRecord` — рекорд в последней сессии (тренд-иконка/фильтр «только рекорды»).
- ChartCard «только рекорды»: оставляет точки, превысившие максимум-до-сих-пор; дельта/процент к первой точке.
- `formatTonnage`: ≥1000 кг → «N,N т». `formatTime`: ≥3600→ч, ≥60→мин.
- Замеры приходят новыми сверху — для графиков разворачиваются по возрастанию даты.
- Файлы приватные: `fileUrl(id)='/api/files/:id'` (cookie-сессия).

## Сводка эндпоинтов

- `GET /api/clients/:id` — клиент (заголовок).
- `GET /api/clients/:id/workouts` — тренировки (обзор упражнений, тоннаж).
- `GET /api/clients/:id/measurements` — замеры.
- `POST /api/clients/:id/measurements` — создать замер.
- `PATCH /api/clients/:id/measurements/:mid` — изменить замер.
- `DELETE /api/clients/:id/measurements/:mid` — удалить замер.
- `GET /api/clients/:id/measurement-tasks` — открытые задачи на замеры.
- `POST /api/clients/:id/measurement-tasks` `{note}` — запросить замеры.
- `DELETE /api/clients/:id/measurement-tasks/:tid` — отменить запрос.
- `GET /api/clients/:id/progress-photos` — фото.
- `POST /api/clients/:id/progress-photos` (multipart) — загрузить фото.
- `DELETE /api/clients/:id/progress-photos/:pid` — удалить фото.
- `GET /api/files/:id` — приватный файл (img).
