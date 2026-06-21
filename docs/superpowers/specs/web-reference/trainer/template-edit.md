# Тренировка-шаблон (сборка/правка) — TemplateEditPage.tsx

**Маршрут:** `/knowledge/templates/new` (create) · `/knowledge/templates/:id/edit`
(edit) · **Точки входа:** FAB и строки списка «Базы знаний».
**Назначение:** конструктор шаблона тренировки. **Два шага**: (1) выбор упражнений
со счётчиком подходов; (2) детали (название/тип/параметры/порядок позиций) и сохранение.

Один компонент, проп `mode`. В edit шаг сразу `2` (`step = editing ? 2 : 1`); в
create начинается с `1`.

## Модель данных формы (важно)

- **Позиция (`Draft`) = одно вхождение упражнения = один подход.** Количество
  подходов = число карточек одного `exerciseId`. Значения хранятся строками.
- При сохранении каждая карточка → `TemplateExercise` с **`sets: 1`** (подходы
  «разворачиваются» в отдельные позиции, а не в поле `sets`).
- При загрузке существующего шаблона позиции с `sets>1` разворачиваются обратно в
  N карточек (`flatMap`, `Math.max(1, p.sets)`).
- `timeBased` = упражнение «на время» (`defaultTimeSec !== null && defaultReps ===
null`) — у такой карточки поле «Сек» вместо «Повт./Кг».

## Шаг 1 — выбор группы и упражнений (макет)

1. **`ScreenHeader`**: title «Сборка тренировки», `closeIcon`, `back="/knowledge"`;
   справа кнопка **«Дальше»** (`disabled` при `positions.length === 0`) → `setStep(2)`.
2. Кикер `font-mono` «шаг 1 из 2».
3. **Группа мышц** (чипы): «Все» (`__all__`) + группы из реальных категорий
   каталога (`GROUP_ORDER` затем алфавит). По умолчанию выбрана первая (обычно
   «Грудь»). Активный — `bg-accent text-accent-on`.
4. **Подгруппа** (если выбрана конкретная группа и `subgroupsFor(group)` непуст):
   «Все» + чипы подгрупп.
5. **Поиск упражнения** (`shelf`, `Search`/`X`) — `rankBySearch` по `name`.
6. **Список упражнений** группы (карточки `bg-card`):
   - чек-бокс (выбрано → `bg-accent` с галочкой; иначе рамка `border-line`);
   - миниатюра 48px (`thumbUrl ?? imageUrl`, `object-cover`; нет → `Dumbbell`);
   - название (15px semibold) + целевые мышцы (`musclesFor(category)`);
   - кнопка **«i»** (`Info`) → модалка краткой информации;
   - если выбрано — степпер подходов: `Minus` / число / `Plus`.
7. **Модалка «i»** (bottom-sheet, `bg-bg`, `role=dialog`): имя + мышцы + кнопка `X`
   - `<ExerciseDetails exercise={infoEx}/>` (демо/характеристики/описание).

Пустые состояния: каталог грузится — «Загрузка каталога…»; каталог пуст —
«Сначала добавьте упражнения в базу знаний.»; поиск/группа без результата —
«Ничего не найдено.».

## Шаг 2 — детали и сохранение (макет)

1. **`ScreenHeader`**: title «Тренировка» (edit) / «Сборка тренировки» (create);
   `back` = `/knowledge` (edit) или `() => setStep(1)` (create); слева в create —
   кнопка «‹ Назад» (→ шаг 1); справа — **«Сохранить»** (edit) / **«Готово»**
   (create), `disabled` при `isPending` / пустом названии / `positions.length===0`.
2. Кикер «шаг 2 из 2» (только create).
3. **Название** (`input`, placeholder «Верх · Сила»).
4. **Краткое описание** (`textarea` rows=2).
5. **Тип** (чипы `TEMPLATE_TAGS`: Сила, Гипертрофия, Push, Pull, Восстановительная,
   Кардио, Кроссфит, Йога, Реабилитация). Одиночный выбор-тоггл (повторный тап
   снимает) → `categoryTag`.
6. **Упражнения** (заголовок + счётчик `positions.length`): `SortableList` —
   перетаскивание за ручку `GripVertical` (только вертикаль). Каждая карточка:
   - имя + категория;
   - `HoldToDelete` (тап → `ConfirmDialog` «Убрать упражнение?») → `removePosition`;
   - поля (`SetField`, `type=number`): для `timeBased` — «Сек» + «Отдых» (2 кол.);
     иначе — «Повт.» + «Кг» (`step 0.5`) + «Отдых» (3 кол.);
   - «Показать больше / Скрыть» (если у упражнения есть видео/фото/оборудование/
     мышцы/описание) → раскрывает `<ExerciseDetails>`.
7. **Ошибка** сохранения (нейтральная) при `mutation.isError`.
8. **«Удалить шаблон»** (`Button secondary`) — только edit.

## Данные

| Поле               | Источник (edit)                                       | Дефолт (create) |
| ------------------ | ----------------------------------------------------- | --------------- |
| каталог            | `useExercises()` → `GET /api/exercises`               | —               |
| шаблон             | `useTemplate(id)` → `GET /api/workout-templates/:id`  | —               |
| `name`             | `t.name`                                              | `''`            |
| `shortDescription` | `t.shortDescription ?? ''`                            | `''`            |
| `categoryTag`      | `t.categoryTag`                                       | `null`          |
| `positions`        | `t.exercises` развёрнуты по `sets` в карточки         | `[]`            |
| группы (чипы)      | уникальные `category` каталога, `GROUP_ORDER`+алфавит | —               |

`useTemplate` `enabled: id.length>0`. `exById` — карта `id→ExerciseResponse` для
блока «Показать больше». `countByExercise` — карта `exerciseId→число карточек`.

## Действия

- **Выбор группы/подгруппы** → фильтрация каталога; смена группы сбрасывает подгруппу.
- **toggleExercise** → добавить (одна карточка `draftFromExercise`) или убрать все
  карточки этого упражнения.
- **setCount(ex, n)** (n≥1): подгоняет число карточек упражнения — лишние срезает,
  недостающие добавляет сразу после последней карточки этого упражнения.
- **«Дальше»** → `setStep(2)` (нужна ≥1 позиция).
- **updatePosition / removePosition / onReorder** — правка полей, удаление,
  переупорядочивание позиций (drag).
- **Тип** — выбор/снятие тега.
- **save**: no-op если `name.trim()===''` или `positions.length===0`. `buildPayload`
  (`CreateTemplateRequest`): каждая позиция → `{ exerciseId, sets:1, reps, weightKg,
timeSec, restSec }`, где для `timeBased` `reps/weightKg=null` и берётся `timeSec`,
  иначе `timeSec=null`; `restSec = parseOptNum(restSec) ?? 90`; `name`/`shortDescription`/
  `categoryTag` — trim-или-null.
  - create → `createMutation` → **`POST /api/workout-templates`**.
  - edit → `updateMutation` → **`PATCH /api/workout-templates/:id`** (при наличии
    `exercises` список заменяется целиком).
  - onSuccess → `navigate('/knowledge', {replace:true})`.
- **handleDelete** (edit): `window.confirm('Удалить шаблон? Действие необратимо.')`
  → `deleteMutation` → **`DELETE /api/workout-templates/:id`** → `/knowledge` replace.

## Состояния

- **loading каталога** (шаг 1): «Загрузка каталога…».
- **loading шаблона** (edit, `existing.isPending` на шаге 2): хедер «Тренировка» +
  «Загрузка…».
- **empty каталог**: «Сначала добавьте упражнения в базу знаний.».
- **«Дальше»/«Сохранить» disabled**: нет позиций / пустое имя / `isPending`.
- **позиций нет на шаге 2**: «Вернитесь на шаг 1 и выберите упражнения.».
- **error сохранения**: нейтральная строка.

## Навигация

шаг1 «Дальше»→шаг2 · шаг2 «Назад»/back(create)→шаг1 · back(edit)→`/knowledge` ·
сохранение/удаление→`/knowledge` (replace).

## Бизнес-правила и edge-cases

- **Подходы как карточки:** API получает `sets:1` на каждую позицию; «3 подхода»
  = 3 одинаковые позиции подряд. Обратно при загрузке `sets` разворачивается в карточки.
- **`timeBased`** меняет набор полей и обнуляет несовместимые (`reps/weightKg` либо
  `timeSec`) в payload.
- Группа «Все» (`__all__`) показывает упражнения всех категорий, подгруппы для неё
  не применяются.
- `musclesFor(category)` — статическая карта `MUSCLES_BY_CATEGORY` (в API мышц
  упражнения нет; первые 3 через запятую).
- `parseOptNum`: пусто → `null`; нечисло → `null`; иначе число.
- Инварианты схемы: `name` 1–200; ≥1 упражнение (`exercises.min(1)`); `restSec`
  0–3600 (default 90); `reps/timeSec` — целые положительные, `weightKg` —
  положительное; `shortDescription` ≤2000, `categoryTag` ≤100.

## Сводка эндпоинтов

- `GET /api/exercises` → `{ exercises }` — каталог (шаг 1, и для «Показать больше»).
- `GET /api/workout-templates/:id` → `{ template }` — загрузка (edit).
- `POST /api/workout-templates` (тело `CreateTemplateRequest`) → `{ template }` — создание.
- `PATCH /api/workout-templates/:id` (тело `UpdateTemplateRequest`) → `{ template }`
  — правка (список упражнений заменяется целиком).
- `DELETE /api/workout-templates/:id` → `{ ok }` — удаление.

Инвалидации: create → `['templates']`; update/delete → `['templates']` и
`['templates', id]`.
