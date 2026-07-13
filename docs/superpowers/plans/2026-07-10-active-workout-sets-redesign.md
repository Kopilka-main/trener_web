# Переработка экрана проведения тренировки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Один блок на упражнение со свёрнутыми подходами; свайп подхода влево → `+1` / редактировать / удалить; подходы одного упражнения не плодят карточки.

**Architecture:** Бэк получает два эндпойнта для одного подхода (`POST .../:pos/sets`, `DELETE .../:pos/sets/:idx`) поверх таблицы `client_workout_sets`. Фронт тренера склеивает соседние `WorkoutExercise` с одним `exerciseId` в блок, рисует свёрнутые подходы, свайп — через `flutter_slidable`. После каждой мутации экран берёт свежую тренировку с сервера.

**Tech Stack:** Fastify + Drizzle + Zod (бэк), Flutter + Riverpod + flutter_slidable (фронт).

## Global Constraints

- Область: только тренерское приложение `mobile/apps/trainer` + бэкенд. Клиентское приложение не трогаем.
- `+1` — всегда молча копия подхода (плановые параметры), без удержания.
- Удаление подхода — с диалогом подтверждения; удаление последнего подхода упражнения удаляет само упражнение.
- Мутации без оптимизма: сервер возвращает полную тренировку, экран делает `setState` на неё (паттерн `_run`).
- Бэк-тесты гонять только против `trener_test` (itest); юнит-тесты сервиса — обычным vitest.
- Не пересобирать APK без явной просьбы.

---

### Task 1: Shared Zod-схема добавления подхода

**Files:**

- Modify: `packages/shared/src/workouts.ts` (рядом с `addWorkoutExerciseRequestSchema`, `updateSetRequestSchema`, `setParams`)

**Interfaces:**

- Produces: `addWorkoutSetRequestSchema` (плановые поля подхода, все опц.), тип `AddWorkoutSetRequest`. Переиспользуется существующий `setParams` (`{ id, wid, pos, idx }`) для DELETE.

- [ ] **Step 1: Найти существующие схемы**

Run: `grep -n "addWorkoutExerciseRequestSchema\|updateSetRequestSchema\|setParams\|plannedSetSchema\|plannedReps" packages/shared/src/workouts.ts`
Ожидание: увидеть форму планового подхода (`plannedReps/plannedWeightKg/plannedTimeSec/plannedRestSec`, positive nullish) и `setParams`.

- [ ] **Step 2: Добавить схему запроса**

Рядом с `addWorkoutExerciseRequestSchema` добавить (переиспользуя тот же тип полей, что в плановом подходе):

```ts
// Добавление ОДНОГО подхода к упражнению (плановые параметры, все опциональны).
export const addWorkoutSetRequestSchema = z.object({
  plannedReps: z.number().positive().nullish(),
  plannedWeightKg: z.number().positive().nullish(),
  plannedTimeSec: z.number().positive().nullish(),
  plannedRestSec: z.number().positive().nullish(),
});
export type AddWorkoutSetRequest = z.infer<typeof addWorkoutSetRequestSchema>;
```

Если в файле уже есть переиспользуемый `plannedSetSchema` — использовать его: `export const addWorkoutSetRequestSchema = plannedSetSchema;`

- [ ] **Step 3: Собрать shared**

Run: `npm run build -w @trener/shared` (или корневой `npm run build`)
Ожидание: без ошибок TypeScript.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/workouts.ts
git commit -m "feat(shared): схема добавления одного подхода"
```

---

### Task 2: Репозиторий — addSet / deleteSet

**Files:**

- Modify: `apps/api/src/modules/client-workouts/client-workouts.repo.ts`

**Interfaces:**

- Consumes: приватные хелперы файла — `loadHead`, `getFull`, `rewriteExercises`, `scope`-паттерн; таблицы `clientWorkoutExercises`, `clientWorkoutSets`.
- Produces:
  - `addSet(trainerId, clientId, workoutId, pos, planned, ownedByClientOnly?) => Promise<WorkoutRow | null | 'not_found_pos'>`
  - `deleteSet(trainerId, clientId, workoutId, pos, idx, ownedByClientOnly?) => Promise<WorkoutRow | null | 'not_found_pos' | 'not_found_set'>`
  - тип `PlannedSetInput` уже существует (используется в `addExercise`); переиспользовать.

- [ ] **Step 1: Прочитать паттерны**

Run: `grep -n "async addExercise\|async removeExercise\|rewriteExercises\|PlannedSetInput\|loadHead\|getFull" apps/api/src/modules/client-workouts/client-workouts.repo.ts`
Ожидание: увидеть сигнатуры и хелпер `rewriteExercises(tx, workoutId, orderedPositions)`.

- [ ] **Step 2: Добавить `addSet` (после `removeExercise`)**

```ts
// Добавляет один подход В КОНЕЦ упражнения на позиции pos (следующий set_index).
// 'not_found_pos' — такой позиции нет; null — тренировки нет в паре.
async addSet(
  trainerId: string,
  clientId: string,
  workoutId: string,
  pos: number,
  planned: PlannedSetInput,
  ownedByClientOnly = false,
): Promise<WorkoutRow | null | 'not_found_pos'> {
  const head = await loadHead(trainerId, clientId, workoutId);
  if (!head || (ownedByClientOnly && !head.createdByClient)) return null;

  const result = await db.transaction(async (tx) => {
    const [exists] = await tx
      .select({ position: clientWorkoutExercises.position })
      .from(clientWorkoutExercises)
      .where(
        and(
          eq(clientWorkoutExercises.workoutId, workoutId),
          eq(clientWorkoutExercises.position, pos),
        ),
      );
    if (!exists) return 'not_found_pos' as const;

    const sets = await tx
      .select({ setIndex: clientWorkoutSets.setIndex })
      .from(clientWorkoutSets)
      .where(
        and(
          eq(clientWorkoutSets.workoutId, workoutId),
          eq(clientWorkoutSets.exercisePosition, pos),
        ),
      );
    const nextIndex = sets.reduce((max, s) => Math.max(max, s.setIndex + 1), 0);

    await tx.insert(clientWorkoutSets).values({
      workoutId,
      exercisePosition: pos,
      setIndex: nextIndex,
      plannedReps: planned.plannedReps ?? null,
      plannedWeightKg: planned.plannedWeightKg ?? null,
      plannedTimeSec: planned.plannedTimeSec ?? null,
      plannedRestSec: planned.plannedRestSec ?? null,
      done: 0,
    });
    return 'ok' as const;
  });

  if (result === 'not_found_pos') return 'not_found_pos';
  return getFull(trainerId, clientId, workoutId);
}
```

- [ ] **Step 3: Добавить `deleteSet`**

```ts
// Удаляет подход (pos, idx), переиндексирует оставшиеся подходы упражнения 0..n-1.
// Если удалён последний подход упражнения — удаляет само упражнение (перенумеровав
// оставшиеся упражнения). null — нет в паре; 'not_found_pos'/'not_found_set' — нет позиции/подхода.
async deleteSet(
  trainerId: string,
  clientId: string,
  workoutId: string,
  pos: number,
  idx: number,
  ownedByClientOnly = false,
): Promise<WorkoutRow | null | 'not_found_pos' | 'not_found_set'> {
  const head = await loadHead(trainerId, clientId, workoutId);
  if (!head || (ownedByClientOnly && !head.createdByClient)) return null;

  const result = await db.transaction(async (tx) => {
    const exRows = await tx
      .select({ position: clientWorkoutExercises.position })
      .from(clientWorkoutExercises)
      .where(eq(clientWorkoutExercises.workoutId, workoutId))
      .orderBy(asc(clientWorkoutExercises.position));
    if (!exRows.some((r) => r.position === pos)) return 'not_found_pos' as const;

    const setRows = await tx
      .select({ setIndex: clientWorkoutSets.setIndex })
      .from(clientWorkoutSets)
      .where(
        and(
          eq(clientWorkoutSets.workoutId, workoutId),
          eq(clientWorkoutSets.exercisePosition, pos),
        ),
      )
      .orderBy(asc(clientWorkoutSets.setIndex));
    if (!setRows.some((r) => r.setIndex === idx)) return 'not_found_set' as const;

    // Удаляем целевой подход.
    await tx
      .delete(clientWorkoutSets)
      .where(
        and(
          eq(clientWorkoutSets.workoutId, workoutId),
          eq(clientWorkoutSets.exercisePosition, pos),
          eq(clientWorkoutSets.setIndex, idx),
        ),
      );

    const remaining = setRows.filter((r) => r.setIndex !== idx).map((r) => r.setIndex);
    if (remaining.length === 0) {
      // Последний подход удалён → убираем всё упражнение и перенумеровываем.
      await rewriteExercises(
        tx,
        workoutId,
        exRows.filter((r) => r.position !== pos).map((r) => r.position),
      );
      return 'ok' as const;
    }

    // Переиндексируем оставшиеся подходы 0..n-1 (в порядке возрастания старого индекса).
    // Двухфазно, чтобы не ловить конфликт уникального (workoutId, pos, setIndex):
    // сначала сдвигаем в отрицательную зону, потом в 0..n-1.
    for (let i = 0; i < remaining.length; i++) {
      await tx
        .update(clientWorkoutSets)
        .set({ setIndex: -1 - i })
        .where(
          and(
            eq(clientWorkoutSets.workoutId, workoutId),
            eq(clientWorkoutSets.exercisePosition, pos),
            eq(clientWorkoutSets.setIndex, remaining[i]!),
          ),
        );
    }
    for (let i = 0; i < remaining.length; i++) {
      await tx
        .update(clientWorkoutSets)
        .set({ setIndex: i })
        .where(
          and(
            eq(clientWorkoutSets.workoutId, workoutId),
            eq(clientWorkoutSets.exercisePosition, pos),
            eq(clientWorkoutSets.setIndex, -1 - i),
          ),
        );
    }
    return 'ok' as const;
  });

  if (result !== 'ok') return result;
  return getFull(trainerId, clientId, workoutId);
}
```

> Примечание: если у `client_workout_sets` НЕТ уникального индекса по `(workout_id, exercise_position, set_index)`, двухфазный сдвиг всё равно безопасен и не мешает. Проверить наличие индекса: `grep -n "clientWorkoutSets" apps/api/src/db/schema.ts`.

- [ ] **Step 4: Проверить сборку**

Run: `cd apps/api && npm run build`
Ожидание: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/client-workouts/client-workouts.repo.ts
git commit -m "feat(api): репозиторий addSet/deleteSet подхода"
```

---

### Task 3: Сервис addSet/deleteSet + юнит-тесты (TDD)

**Files:**

- Modify: `apps/api/src/modules/client-workouts/client-workouts.service.ts`
- Test: `apps/api/src/modules/client-workouts/client-workouts.service.test.ts`

**Interfaces:**

- Consumes: `repo.addSet`, `repo.deleteSet` (Task 2).
- Produces:
  - `addSet(trainerId, clientId, workoutId, pos, input: AddWorkoutSetRequest) => Promise<WorkoutResponse>`
  - `deleteSet(trainerId, clientId, workoutId, pos, idx) => Promise<WorkoutResponse>`
  - Ошибки: `notFound('Тренировка не найдена')` при `null`; `notFound('Упражнение не найдено')` при `'not_found_pos'`; `notFound('Подход не найден')` при `'not_found_set'`.

- [ ] **Step 1: Написать падающие тесты**

Добавить в `client-workouts.service.test.ts` (использовать существующие `fakeRepo`/хелперы файла; при необходимости расширить fakeRepo методами `addSet`/`deleteSet: vi.fn()`):

```ts
it('addSet: пробрасывает плановые поля в репозиторий и возвращает маппинг', async () => {
  const addSet = vi.fn(() => Promise.resolve(workoutRow())); // workoutRow() — существующий хелпер строки тренировки
  const svc = makeService(fakeRepo({ addSet }));
  await svc.addSet('A', 'c1', 'w1', 0, { plannedReps: 10, plannedWeightKg: 50 });
  expect(addSet).toHaveBeenCalledWith('A', 'c1', 'w1', 0, { plannedReps: 10, plannedWeightKg: 50 });
});

it('addSet: not_found_pos → 404 "Упражнение не найдено"', async () => {
  const svc = makeService(fakeRepo({ addSet: vi.fn(() => Promise.resolve('not_found_pos')) }));
  await expect(svc.addSet('A', 'c1', 'w1', 9, {})).rejects.toMatchObject({ statusCode: 404 });
});

it('deleteSet: not_found_set → 404 "Подход не найден"', async () => {
  const svc = makeService(fakeRepo({ deleteSet: vi.fn(() => Promise.resolve('not_found_set')) }));
  await expect(svc.deleteSet('A', 'c1', 'w1', 0, 5)).rejects.toMatchObject({ statusCode: 404 });
});

it('deleteSet: успех → возвращает маппинг тренировки', async () => {
  const deleteSet = vi.fn(() => Promise.resolve(workoutRow()));
  const svc = makeService(fakeRepo({ deleteSet }));
  const res = await svc.deleteSet('A', 'c1', 'w1', 0, 1);
  expect(deleteSet).toHaveBeenCalledWith('A', 'c1', 'w1', 0, 1);
  expect(res.id).toBeDefined();
});
```

> Перед написанием свериться с фактическими именами хелперов теста: `grep -n "fakeRepo\|makeService\|workoutRow\|function row\|toResponse" apps/api/src/modules/client-workouts/client-workouts.service.test.ts` и адаптировать вызовы.

- [ ] **Step 2: Запустить — убедиться, что падают**

Run: `npx vitest run apps/api/src/modules/client-workouts/client-workouts.service.test.ts`
Ожидание: FAIL (методов `addSet`/`deleteSet` в сервисе нет).

- [ ] **Step 3: Реализовать методы сервиса**

Мидель по образцу `updateSet`/`removeExercise` (найти маппер ответа, напр. `toResponse`/`workoutToResponse`):

```ts
async addSet(
  trainerId: string,
  clientId: string,
  workoutId: string,
  pos: number,
  input: AddWorkoutSetRequest,
): Promise<WorkoutResponse> {
  const res = await repo.addSet(trainerId, clientId, workoutId, pos, {
    plannedReps: input.plannedReps ?? null,
    plannedWeightKg: input.plannedWeightKg ?? null,
    plannedTimeSec: input.plannedTimeSec ?? null,
    plannedRestSec: input.plannedRestSec ?? null,
  });
  if (res === null) throw notFound('Тренировка не найдена');
  if (res === 'not_found_pos') throw notFound('Упражнение не найдено');
  return toResponse(res);
},

async deleteSet(
  trainerId: string,
  clientId: string,
  workoutId: string,
  pos: number,
  idx: number,
): Promise<WorkoutResponse> {
  const res = await repo.deleteSet(trainerId, clientId, workoutId, pos, idx);
  if (res === null) throw notFound('Тренировка не найдена');
  if (res === 'not_found_pos') throw notFound('Упражнение не найдено');
  if (res === 'not_found_set') throw notFound('Подход не найден');
  return toResponse(res);
},
```

Импортировать `AddWorkoutSetRequest` из `@trener/shared`.

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run apps/api/src/modules/client-workouts/client-workouts.service.test.ts`
Ожидание: PASS (все, включая существующие).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/client-workouts/client-workouts.service.ts apps/api/src/modules/client-workouts/client-workouts.service.test.ts
git commit -m "feat(api): сервис addSet/deleteSet + тесты"
```

---

### Task 4: Роуты POST/DELETE подхода

**Files:**

- Modify: `apps/api/src/modules/client-workouts/client-workouts.routes.ts`

**Interfaces:**

- Consumes: `svc.addSet`, `svc.deleteSet` (Task 3); `addWorkoutSetRequestSchema`, `setParams`, `exerciseParams`, `workoutWrap` (существующие).

- [ ] **Step 1: Посмотреть образцы роутов**

Run: `grep -n "exercises/:pos/sets/:idx\|exercises/:pos'\|exerciseParams\|setParams\|workoutWrap\|trainerId(req)" apps/api/src/modules/client-workouts/client-workouts.routes.ts`

- [ ] **Step 2: Добавить POST (после PATCH updateSet)**

```ts
typed.post(
  '/api/clients/:id/workouts/:wid/exercises/:pos/sets',
  {
    preHandler,
    schema: {
      params: exerciseParams,
      body: addWorkoutSetRequestSchema,
      response: { 200: workoutWrap },
    },
  },
  async (req) => ({
    workout: await svc.addSet(
      trainerId(req),
      req.params.id,
      req.params.wid,
      req.params.pos,
      req.body,
    ),
  }),
);
```

- [ ] **Step 3: Добавить DELETE**

```ts
typed.delete(
  '/api/clients/:id/workouts/:wid/exercises/:pos/sets/:idx',
  {
    preHandler,
    schema: { params: setParams, response: { 200: workoutWrap } },
  },
  async (req) => ({
    workout: await svc.deleteSet(
      trainerId(req),
      req.params.id,
      req.params.wid,
      req.params.pos,
      req.params.idx,
    ),
  }),
);
```

Добавить импорт `addWorkoutSetRequestSchema`.

- [ ] **Step 4: Сборка**

Run: `cd apps/api && npm run build`
Ожидание: без ошибок.

- [ ] **Step 5 (опц.): itest роутов на trener_test**

Если есть `client-workouts.routes.itest.ts` — добавить кейсы: POST добавляет подход (в ответе на +1 больше), DELETE убирает (переиндексация), DELETE последнего подхода убирает упражнение.
Run: `npx vitest run apps/api/src/modules/client-workouts/client-workouts.routes.itest.ts` (только против trener_test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/client-workouts/client-workouts.routes.ts
git commit -m "feat(api): роуты POST/DELETE подхода упражнения"
```

---

### Task 5: Зависимость flutter_slidable + API-методы фронта

**Files:**

- Modify: `mobile/apps/trainer/pubspec.yaml`
- Modify: `mobile/apps/trainer/lib/api/trainer_workouts.dart`

**Interfaces:**

- Produces: `TrainerWorkoutsApi.addSet(clientId, wid, pos, WorkoutSet template)`, `TrainerWorkoutsApi.deleteSet(clientId, wid, pos, idx)`; обе возвращают `Future<Workout>`.

- [ ] **Step 1: Добавить зависимость**

В `pubspec.yaml` в `dependencies` добавить `flutter_slidable: ^3.1.0` (проверить актуальную стабильную).
Run: `cd mobile/apps/trainer && flutter pub get`
Ожидание: успешно.

- [ ] **Step 2: Добавить методы API (по образцу `duplicateExercise`/`removeExercise`)**

```dart
/// Добавить один подход к упражнению на позиции pos (копия плановых параметров).
Future<Workout> addSet(String clientId, String wid, int pos, WorkoutSet template) async {
  final Map<String, dynamic> r = await _api.postJson(
    '${_base(clientId, wid)}/exercises/$pos/sets',
    <String, dynamic>{
      if (template.plannedReps != null) 'plannedReps': template.plannedReps,
      if (template.plannedWeightKg != null) 'plannedWeightKg': template.plannedWeightKg,
      if (template.plannedTimeSec != null) 'plannedTimeSec': template.plannedTimeSec,
      if (template.plannedRestSec != null) 'plannedRestSec': template.plannedRestSec,
    },
  );
  return _unwrap(r);
}

/// Удалить подход (pos, idx). Последний подход упражнения удаляет и само упражнение.
Future<Workout> deleteSet(String clientId, String wid, int pos, int idx) async {
  final Map<String, dynamic> r = await _api.deleteJson('${_base(clientId, wid)}/exercises/$pos/sets/$idx');
  return _unwrap(r);
}
```

- [ ] **Step 3: Анализ**

Run: `flutter analyze lib/api/trainer_workouts.dart`
Ожидание: No issues found.

- [ ] **Step 4: Commit**

```bash
git add mobile/apps/trainer/pubspec.yaml mobile/apps/trainer/pubspec.lock mobile/apps/trainer/lib/api/trainer_workouts.dart
git commit -m "feat(trainer): flutter_slidable + API addSet/deleteSet"
```

---

### Task 6: Группировка упражнений + свёрнутый блок `_ExerciseBlock`

**Files:**

- Modify: `mobile/apps/trainer/lib/screens/active_workout_screen.dart`

**Interfaces:**

- Produces:
  - модель `_ExGroup { String exerciseId; String title; List<int> positions; List<({int pos, WorkoutSet set})> sets; }`
  - функция `List<_ExGroup> _groupExercises(List<WorkoutExercise> exs, Map<int,String> labels)` — склеивает соседние (по возрастанию position) упражнения с одинаковым `exerciseId` в группу; `title` = имя упражнения (без нумерации 1/2/3).
  - виджет `_ExerciseBlock` (свёрнут по умолчанию): шапка `[drag] title · «N подходов · X/N» · [▸/▾]`, при раскрытии — `Column` из `_SwipeSetRow` по каждому `sets`.
  - состояние в `_ConductorState`: `final Set<String> _expandedGroups = <String>{};` (по `exerciseId`).

- [ ] **Step 1: Прочитать текущий `_buildActive` и `_ActiveExerciseCard`**

Run: `grep -n "_buildActive\|_ActiveExerciseCard\|_activeSetRow\|ReorderableListView\|_exerciseLabels\|isDoneEx" mobile/apps/trainer/lib/screens/active_workout_screen.dart`

- [ ] **Step 2: Добавить модель и группировку** (верх файла, рядом с `_exerciseLabels`):

```dart
class _ExGroup {
  _ExGroup(this.exerciseId, this.title, this.positions, this.sets);
  final String exerciseId;
  final String title;
  final List<int> positions;
  final List<({int pos, WorkoutSet set})> sets;
  bool get allDone => sets.isNotEmpty && sets.every((e) => e.set.done);
  int get doneCount => sets.where((e) => e.set.done).length;
}

/// Склеивает соседние (по position) упражнения с одинаковым exerciseId в один блок.
List<_ExGroup> _groupExercises(List<WorkoutExercise> exs) {
  final List<WorkoutExercise> sorted = <WorkoutExercise>[...exs]..sort((a, b) => a.position - b.position);
  final List<_ExGroup> out = <_ExGroup>[];
  for (final WorkoutExercise e in sorted) {
    final _ExGroup? last = out.isEmpty ? null : out.last;
    if (last != null && last.exerciseId == e.exerciseId) {
      last.positions.add(e.position);
      last.sets.addAll(e.sets.map((WorkoutSet s) => (pos: e.position, set: s)));
    } else {
      out.add(_ExGroup(
        e.exerciseId,
        e.name,
        <int>[e.position],
        e.sets.map((WorkoutSet s) => (pos: e.position, set: s)).toList(),
      ));
    }
  }
  return out;
}
```

- [ ] **Step 3: Добавить `_ExerciseBlock`** (заменяет `_ActiveExerciseCard`; drag на шапке, дети — переданный `sets`-виджет). Ключевые части:

```dart
class _ExerciseBlock extends StatelessWidget {
  const _ExerciseBlock({
    super.key,
    required this.listIndex,
    required this.group,
    required this.expanded,
    required this.onToggle,
    required this.buildSetRow, // Widget Function(int pos, WorkoutSet set, int displayNo)
  });
  final int listIndex;
  final _ExGroup group;
  final bool expanded;
  final VoidCallback onToggle;
  final Widget Function(int pos, WorkoutSet set, int displayNo) buildSetRow;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onToggle,
            child: Row(
              children: <Widget>[
                ReorderableDragStartListener(
                  index: listIndex,
                  child: Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Icon(Icons.drag_indicator, size: 20, color: c.inkMutedXl),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(group.title,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                      Text('${group.sets.length} подходов · ${group.doneCount}/${group.sets.length}',
                          style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w500)),
                    ],
                  ),
                ),
                Icon(expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down, color: c.inkMuted),
              ],
            ),
          ),
          if (expanded) ...<Widget>[
            const SizedBox(height: 6),
            for (int i = 0; i < group.sets.length; i++)
              buildSetRow(group.sets[i].pos, group.sets[i].set, i + 1),
          ],
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Переписать блок `pending` в `_buildActive`** — вместо `_ActiveExerciseCard` строить `_groupExercises(pending)` и `_ExerciseBlock`. Реордер (`ReorderableListView`) по группам: `onReorderItem` переставляет `positions` первой позиции группы; итоговый `order` = плоский список всех `positions` завершённых + переставленных pending. Раскрытие: `expanded: _expandedGroups.contains(g.exerciseId)`, `onToggle: () => setState(() => _expandedGroups.toggle(g.exerciseId))` (реализовать toggle: contains? remove : add).

> `buildSetRow` временно вернуть существующий `_activeSetRow(ex, s)` — для этого найти `WorkoutExercise` по `pos`: `_w.exercises.firstWhere((e) => e.position == pos)`. Свайп добавим в Task 7.

- [ ] **Step 5: Завершённые блоки** — секцию «ЗАВЕРШЕНО» строить тоже через `_groupExercises(completed)` (в свёрнутом виде `_ExerciseBlock`, но неинтерактивно / прозрачность как сейчас).

- [ ] **Step 6: Анализ**

Run: `flutter analyze lib/screens/active_workout_screen.dart`
Ожидание: No issues found (могут остаться неиспользуемые `_ActiveExerciseCard`/`onDuplicate` — удалить их и вызов `_duplicateExercise` на экране).

- [ ] **Step 7: Commit**

```bash
git add mobile/apps/trainer/lib/screens/active_workout_screen.dart
git commit -m "feat(trainer): блоки упражнений со свёрнутыми подходами"
```

---

### Task 7: Свайп-действия подхода (`+1` / редактировать / удалить)

**Files:**

- Modify: `mobile/apps/trainer/lib/screens/active_workout_screen.dart`

**Interfaces:**

- Consumes: `_api.addSet`, `_api.deleteSet` (Task 5); `_SetEditor`/`_api.updateSet` (существующие); `confirmDelete` (существующий); `_run` (паттерн мутации).
- Produces: `Widget _swipeSetRow(int pos, WorkoutSet s, int displayNo)` — оборачивает контент подхода в `Slidable` с тремя действиями. Передаётся в `_ExerciseBlock.buildSetRow`.

- [ ] **Step 1: Импорт**

Добавить `import 'package:flutter_slidable/flutter_slidable.dart';` в начало файла.

- [ ] **Step 2: Реализовать `_swipeSetRow`**

```dart
Widget _swipeSetRow(int pos, WorkoutSet s, int displayNo) {
  final AppColors c = context.colors;
  final WorkoutExercise ex = _w.exercises.firstWhere((WorkoutExercise e) => e.position == pos);
  // Режим редактирования — как сейчас, встроенный _SetEditor.
  final String key = '$pos-${s.setIndex}';
  if (_editing == key) {
    return _SetEditor(
      set: s,
      onCancel: () => setState(() => _editing = null),
      onSave: (Map<String, dynamic> body) async {
        body['done'] = true;
        await _run(() => _api.updateSet(_clientId, _w.id, pos, s.setIndex, body));
        final WorkoutExercise? fx = _w.exercises.where((e) => e.position == pos).firstOrNull;
        final WorkoutSet? fs = fx?.sets.where((x) => x.setIndex == s.setIndex).firstOrNull;
        if (fx != null && fs != null) _startRest(fx, fs);
        setState(() => _editing = null);
      },
    );
  }
  return Slidable(
    key: ValueKey<String>('set-$pos-${s.setIndex}'),
    endActionPane: ActionPane(
      motion: const DrawerMotion(),
      extentRatio: 0.6,
      children: <Widget>[
        SlidableAction(
          onPressed: (_) => _addSetCopy(pos, s),
          backgroundColor: c.accent,
          foregroundColor: c.accentOn,
          icon: Icons.add,
          label: '+1',
        ),
        SlidableAction(
          onPressed: (_) => setState(() => _editing = key),
          backgroundColor: c.cardElevated,
          foregroundColor: c.ink,
          icon: Icons.edit,
          label: 'Изм.',
        ),
        SlidableAction(
          onPressed: (_) => _confirmDeleteSet(pos, s),
          backgroundColor: c.danger,
          foregroundColor: Colors.white,
          icon: Icons.delete_outline,
          label: 'Удал.',
        ),
      ],
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: <Widget>[
          SizedBox(
            width: 20,
            child: Text('$displayNo',
                style: AppFonts.mono(size: 12, color: c.inkMutedXl, weight: FontWeight.w700)),
          ),
          Expanded(child: _SetMetrics(set: s, showActual: s.hasFact || s.done)),
          _CircleBtn(
            icon: Icons.check,
            onTap: () => _toggleDone(ex, s),
            bg: s.done ? c.accent : c.cardElevated,
            fg: s.done ? c.accentOn : c.inkMuted,
          ),
        ],
      ),
    ),
  );
}
```

- [ ] **Step 3: Хелперы `+1` и удаление**

```dart
Future<void> _addSetCopy(int pos, WorkoutSet s) async {
  HapticFeedback.lightImpact();
  await _run(() => _api.addSet(_clientId, _w.id, pos, s));
}

Future<void> _confirmDeleteSet(int pos, WorkoutSet s) async {
  if (!await confirmDelete(context, title: 'Удалить подход?')) return;
  await _run(() => _api.deleteSet(_clientId, _w.id, pos, s.setIndex));
}
```

(Проверить, что `HapticFeedback` импортирован — `package:flutter/services.dart`; если нет, добавить.)

- [ ] **Step 4: Подключить в блок** — в Task 6 заменить `buildSetRow: _activeSetRow-обёртку` на `buildSetRow: _swipeSetRow`. Удалить неиспользуемый `_activeSetRow`, если больше не нужен.

- [ ] **Step 5: Анализ**

Run: `flutter analyze lib/screens/active_workout_screen.dart`
Ожидание: No issues found.

- [ ] **Step 6: Commit**

```bash
git add mobile/apps/trainer/lib/screens/active_workout_screen.dart
git commit -m "feat(trainer): свайп подхода +1/редактировать/удалить"
```

---

### Task 8: Чистка и финальная проверка

**Files:**

- Modify: `mobile/apps/trainer/lib/screens/active_workout_screen.dart` (удалить `_ActiveExerciseCard`, `_duplicateExercise` вызов/метод, `onDuplicate`, устаревший `_activeSetRow`, если не используется)
- Modify: `mobile/apps/trainer/lib/api/trainer_workouts.dart` (удалить `duplicateExercise`, если больше нигде не вызывается)

- [ ] **Step 1: Найти мёртвый код**

Run: `grep -rn "duplicateExercise\|_ActiveExerciseCard\|_activeSetRow\|onDuplicate" mobile/apps/trainer/lib`
Удалить неиспользуемое.

- [ ] **Step 2: Полный анализ приложения**

Run: `cd mobile/apps/trainer && flutter analyze`
Ожидание: No issues found.

- [ ] **Step 3: Финальная сборка бэка + тесты**

Run: `cd apps/api && npm run build && npx vitest run apps/api/src/modules/client-workouts/client-workouts.service.test.ts` (из корня, если нужен монорепный конфиг)
Ожидание: build ок, тесты PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(trainer): удалить дублирование упражнения (заменено на +1)"
```

---

## Self-Review

**Покрытие спека:**

- Два эндпойнта подхода → Task 1–4. ✓
- Группировка соседних упражнений → Task 6 (`_groupExercises`). ✓
- Свёрнутый блок + раскрытие по стрелке → Task 6 (`_ExerciseBlock`, `_expandedGroups`). ✓
- Свайп `+1`/редактировать/удалить + подтверждение → Task 7. ✓
- `+1` = молча копия → Task 7 (`_addSetCopy`). ✓
- Удаление последнего подхода удаляет упражнение → Task 2 (`deleteSet` ветка `remaining.length === 0`). ✓
- Только тренер, клиент не трогаем → область соблюдена. ✓
- flutter_slidable → Task 5. ✓

**Плейсхолдеры:** нет TODO/TBD; код приведён в каждом шаге.

**Согласованность типов:** `addSet(...,pos,planned)`/`deleteSet(...,pos,idx)` одинаковы в репо (Task 2), сервисе (Task 3), роутах (Task 4), API фронта (Task 5). `_ExGroup`/`_groupExercises`/`_ExerciseBlock`/`_swipeSetRow` согласованы между Task 6 и 7.

**Риск:** имена приватных хелперов (`toResponse`, `workoutRow`, `_run`, `_SetMetrics`, `_CircleBtn`, `rewriteExercises`, `setParams`, `exerciseParams`, `workoutWrap`) взяты из наблюдаемых паттернов — каждый шаг начинается с `grep`-сверки перед правкой.
