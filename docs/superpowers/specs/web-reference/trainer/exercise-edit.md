# Упражнение (создание/правка) — ExerciseEditPage.tsx

**Маршрут:** `/knowledge/exercises/new` (create) · `/knowledge/exercises/:id/edit`
(edit) · **Точки входа:** FAB и строки списка «Базы знаний».
**Назначение:** форма упражнения каталога тренера. Системное (глобальное)
упражнение нельзя править на месте — при сохранении создаётся **личная копия**.

Один компонент, режим через проп `mode: 'create' | 'edit'`.

## Макет (сверху вниз)

1. **`ScreenHeader`**: title «Новое упражнение» (create) / «Упражнение» (edit);
   `closeIcon` только в create; `back="/knowledge"`; справа — кнопка **«Сохранить»**
   (`disabled` при `isPending` или пустом названии; во время сохранения — «…»).
2. **Группа мышц** (секция, заголовок `font-mono` 11px uppercase): чипы
   `GROUP_ORDER` = Грудь, Спина, Ноги, Плечи, Руки, Пресс/Кор, Кардио, Растяжка.
   Если у записи кастомная категория — она добавляется первой. Активный чип —
   `bg-accent text-accent-on`, прочие — `bg-chip text-ink`. **`disabled` при
   `isGlobalEdit`** (системное).
3. **Подгруппа** (только если `subgroupsFor(category)` непуст): чип «Не указано» +
   чипы подгрупп. `disabled` при `isGlobalEdit`.
4. **Название** (`input`, border `border-line`, focus `border-accent`).
   `readOnly` при `isGlobalEdit` (текст `text-ink-muted`).
5. **Медиа** (только edit, если есть данные каталога): `<ExerciseDetails
exercise={media} showDescription={false}/>` — демонстрация (видео/фото с
   переключателем) + характеристики (оборудование/целевые мышцы/синергисты).
6. **Описание** (`textarea` rows=3). `readOnly` при `isGlobalEdit`
   (placeholder «Описание из каталога»).
7. **Параметры подхода** (сетка 2×2 из `Stepper`):
   - повторы — `step 1`, unit «повт»;
   - вес — `step 2.5`, unit «кг»;
   - время — `step 5`, unit «сек»;
   - отдых — `step 15`, unit «сек».
8. **Подсказка** (только `isGlobalEdit`): «Системное упражнение из каталога:
   название, группа и описание изменить нельзя — можно настроить только параметры
   подхода. Сохранится как ваша копия.».
9. **Ошибка** (если `mutation.isError`): «Не удалось сохранить…» (нейтральный).
10. **Кнопка «Удалить упражнение»** (`Button variant="secondary"`) — **только в
    edit и НЕ `isGlobalEdit`** (системное удалить нельзя).

## Данные

| Поле              | Источник (edit)                                                        | Дефолт (create) |
| ----------------- | ---------------------------------------------------------------------- | --------------- |
| `name`            | `existing.data.name`                                                   | `''`            |
| `category`        | `e.category`                                                           | `'Грудь'`       |
| `subgroup`        | `e.subgroup ?? ''`                                                     | `''`            |
| `description`     | `e.description ?? ''`                                                  | `''`            |
| `defaultReps`     | `e.defaultReps ?? 0`                                                   | `10`            |
| `defaultWeightKg` | `e.defaultWeightKg ?? 0`                                               | `0`             |
| `defaultTimeSec`  | `e.defaultTimeSec ?? 0`                                                | `0`             |
| `restSec`         | `e.restSec`                                                            | `90`            |
| `isGlobal`        | `existing.data.isGlobal` (= `trainerId === null`)                      | —               |
| медиа             | `imageUrl/thumbUrl/videoUrl/equipment/primaryMuscles/secondaryMuscles` | —               |

`useExercise(id)` → `GET /api/exercises/:id` → `{ exercise: ExerciseResponse }`
(включён только при edit, `enabled: id.length>0`).

## Действия

**Сохранить** (`save`): no-op если `name.trim() === ''`. Собирает `payload`
(`CreateExerciseRequest`):

- `name`, `category` — trim;
- `subgroup`, `description` — trim или `null`;
- `defaultReps/defaultWeightKg/defaultTimeSec` → `positiveOrNull` (0/пусто → `null`);
- `restSec` — как есть (число);
- **`sourceExerciseId: id`** добавляется только при `isGlobalEdit`.

Маршрутизация мутации:

- create ИЛИ `isGlobalEdit` → `createMutation` → **`POST /api/exercises`**.
- edit обычного личного → `updateMutation` → **`PATCH /api/exercises/:id`**.
- onSuccess → `navigate('/knowledge', {replace:true})`.

**Удалить** (`handleDelete`): `window.confirm('Удалить упражнение? Действие
необратимо.')` → `deleteMutation` → **`DELETE /api/exercises/:id`** → onSuccess →
`/knowledge` replace.

## Состояния

- **loading** (edit, `existing.isPending`): хедер «Упражнение» + «Загрузка…».
- **`isGlobalEdit`** (edit системного): группа/подгруппа/название/описание
  заблокированы; виден поясняющий текст; кнопки удаления нет; «Сохранить» создаёт
  копию через `sourceExerciseId`.
- **обычный edit**: все поля редактируемы, доступно удаление.
- **create**: дефолты, есть `closeIcon`, нет блока медиа, нет удаления.
- **save disabled**: `mutation.isPending` или пустое название.
- **error сохранения**: нейтральная строка под параметрами.

## Навигация

back / close → `/knowledge` · сохранение/удаление → `/knowledge` (replace).

## Бизнес-правила и edge-cases

- **Системное → личная копия:** глобальные упражнения (`isGlobal`) на месте не
  правятся; сохранение шлёт POST с `sourceExerciseId=id` — сервер переносит
  фото/видео/мышцы каталога в новую запись тренера.
- `positiveOrNull`: 0 или отрицательное сохраняется как `null` (не задано).
- Смена категории сбрасывает подгруппу, если она не входит в новую таксономию.
- Инварианты схемы: `name` 1–200, `category` 1–100, `description` ≤4000,
  `restSec` 0–3600 (default 90); `defaultReps/Time` — целые положительные,
  `defaultWeightKg` — положительное.
- `Stepper`: клампинг `[min..max]` (0..100000), округление до 2 знаков, ввод с
  клавиатуры (запятая → точка), пусто/невалид → `min`.

## Сводка эндпоинтов

- `GET /api/exercises/:id` → `{ exercise }` — загрузка (edit).
- `POST /api/exercises` (тело `CreateExerciseRequest`, при копии — `+sourceExerciseId`)
  → `{ exercise }` — создание / личная копия.
- `PATCH /api/exercises/:id` (тело `UpdateExerciseRequest`) → `{ exercise }` —
  правка личного.
- `DELETE /api/exercises/:id` → `{ ok }` — удаление личного.

Инвалидации: create → `['exercises']`; update/delete → `['exercises']` и
`['exercises', id]`.
