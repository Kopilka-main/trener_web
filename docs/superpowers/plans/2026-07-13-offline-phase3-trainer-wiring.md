# Офлайн Фаза 1 — План 3: провод в тренерское приложение

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Включить офлайн-движок (План 2) в поток проведения тренировки: тренер создаёт+проводит+завершает тренировку через локальный документ (offline-first), при связи движок сам отправляет её на `import` (План 1); клиенты и шаблоны становятся cache-first; в UI — баннер офлайна и индикатор синка.

**Architecture:** `LocalWorkoutController` держит тренировку как локальный документ (персист на диск), все действия правят его синхронно. `ActiveWorkoutScreen` рендерит из документа (через `LocalWorkout.toWorkout()`), а не из сети. На `complete()` документ кладётся в `Outbox` (`kind: 'workout.import'`). `SyncEngine` при связи шлёт его через `TrainerWorkoutsApi.importWorkout`. Клиенты/шаблоны — через `CachedListNotifier`.

**Tech Stack:** Dart, Flutter, flutter_riverpod, dio, connectivity_plus, flutter_test.

**Depends on:** План 1 (эндпоинт `POST /api/clients/:id/workouts/import`), План 2 (`Outbox`, `SyncEngine`, `NetworkStatus`, `CachedListNotifier`, `KvStore`).

## Global Constraints

- Провайдеры движка живут в `apps/trainer/lib/api/offline_providers.dart`.
- `LocalWorkout*` — в `apps/trainer/lib/api/local_workout.dart`.
- Локальный документ рендерится в существующие модели через `LocalWorkout.toWorkout()` — `ActiveWorkoutScreen` UI менять по минимуму, только источник данных и действия.
- Идемпотентность: `LocalWorkout.id` (клиентский UUID) = `idempotencyKey` в payload импорта.
- Все действия проведения — синхронные (локальные), без сети; сеть — только фоновый синк.
- Стиль/именование — как в существующем `apps/trainer`.

---

### Task 1: `importWorkout` в API + классификатор офлайн-ошибок

**Files:**

- Modify: `packages/core/lib/src/api/api_client.dart` (добавить `isOfflineError`)
- Modify: `mobile/apps/trainer/lib/api/trainer_workouts.dart` (метод `importWorkout`)
- Test: `packages/core/test/offline/offline_error_test.dart`

**Interfaces:**

- Produces:
  - `bool isOfflineError(Object error)` (core) — true для dio connection/timeout ошибок.
  - `Future<void> TrainerWorkoutsApi.importWorkout(String clientId, Map<String,dynamic> doc)` — `POST /api/clients/:id/workouts/import`.

- [ ] **Step 1: Тест на `isOfflineError`**

Создать `packages/core/test/offline/offline_error_test.dart`:

```dart
import 'package:core/core.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  DioException dio(DioExceptionType t) =>
      DioException(requestOptions: RequestOptions(path: '/x'), type: t);

  test('офлайн-ошибки dio → true', () {
    expect(isOfflineError(dio(DioExceptionType.connectionError)), true);
    expect(isOfflineError(dio(DioExceptionType.connectionTimeout)), true);
    expect(isOfflineError(dio(DioExceptionType.receiveTimeout)), true);
  });

  test('ответ сервера (badResponse) и прочее → false', () {
    expect(isOfflineError(dio(DioExceptionType.badResponse)), false);
    expect(isOfflineError(Exception('x')), false);
  });
}
```

- [ ] **Step 2: Запустить — падает**

Run: `cd packages/core && flutter test test/offline/offline_error_test.dart`
Expected: FAIL — `isOfflineError` не найден.

- [ ] **Step 3: Реализовать `isOfflineError`**

В `packages/core/lib/src/api/api_client.dart` после `describeApiError` (~стр. 48) добавить:

```dart
/// true, если ошибка — сетевой сбой (нет связи с сервером), а НЕ ответ сервера.
/// Используется движком синка: сетевой сбой прерывает слив, ответ сервера — нет.
bool isOfflineError(Object error) {
  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return true;
      default:
        return false;
    }
  }
  return false;
}
```

(`api_client.dart` уже экспортируется из `core.dart` — доп. экспорт не нужен.)

- [ ] **Step 4: Реализовать `importWorkout`**

В `mobile/apps/trainer/lib/api/trainer_workouts.dart`, в класс `TrainerWorkoutsApi` (рядом с `complete`, ~стр. 249) добавить:

```dart
  /// Импорт целиком офлайн-проведённой тренировки (идемпотентно по
  /// doc['idempotencyKey']). Тело — importWorkoutRequest (см. @trener/shared).
  Future<void> importWorkout(String clientId, Map<String, dynamic> doc) async {
    await _api.postJson('/api/clients/$clientId/workouts/import', doc);
  }
```

- [ ] **Step 5: Зелёный + анализ**

Run: `cd packages/core && flutter test test/offline/offline_error_test.dart && flutter analyze`
Run: `cd mobile/apps/trainer && flutter analyze`
Expected: тест PASS, оба анализа `No issues found!`.

- [ ] **Step 6: Коммит**

```bash
git add packages/core/lib/src/api/api_client.dart packages/core/test/offline/offline_error_test.dart mobile/apps/trainer/lib/api/trainer_workouts.dart
git commit -m "feat(offline): isOfflineError + TrainerWorkoutsApi.importWorkout"
```

---

### Task 2: `LocalWorkout` + `LocalWorkoutController` (локальный документ)

**Files:**

- Create: `mobile/apps/trainer/lib/api/local_workout.dart`
- Test: `mobile/apps/trainer/test/local_workout_test.dart`

**Interfaces:**

- Consumes: `KvStore`, `Outbox` (core); `Workout`/`WorkoutExercise`/`WorkoutSet` (trainer_workouts.dart).
- Produces:
  - `class LocalSet { int setIndex; num? plannedReps, plannedWeightKg, plannedTimeSec, plannedRestSec, actualReps, actualWeightKg, actualTimeSec; bool done; }`
  - `class LocalExercise { int position; String exerciseId; String name; List<LocalSet> sets; }`
  - `class LocalWorkout { String id; String clientId; String name; String? sourceTemplateId; String status; DateTime? startedAt, completedAt; int? durationSec; String? trainerNote; num? rpe; bool excludedFromBalance; List<LocalExercise> exercises; Workout toWorkout(); Map<String,dynamic> toImportPayload(); Map<String,dynamic> toJson(); factory fromJson(...); }`
  - `class LocalWorkoutController { LocalWorkoutController(KvStore store, Outbox outbox); Future<LocalWorkout> createFromPlan({required String clientId, required String name, String? sourceTemplateId, required List<({String exerciseId, String name, LocalSet set})> plan}); Future<LocalWorkout?> load(String id); Future<void> updateSet(LocalWorkout w, int pos, int setIndex, {num? actualReps, num? actualWeightKg, num? actualTimeSec, num? plannedRestSec, bool? done}); Future<void> addSet(LocalWorkout w, int pos); Future<void> deleteSet(LocalWorkout w, int pos, int setIndex); Future<void> addExercise(LocalWorkout w, {required String exerciseId, required String name, required LocalSet set}); Future<void> removeExercise(LocalWorkout w, int pos); Future<void> reorder(LocalWorkout w, List<int> order); Future<void> start(LocalWorkout w); Future<void> complete(LocalWorkout w, {int? durationSec}); }`
  - `complete` ставит `status='completed'`, `completedAt=now`, персистит и кладёт в `Outbox` элемент `{kind:'workout.import', payload:{'clientId': w.clientId, 'doc': w.toImportPayload()}}`.
  - `toImportPayload()` включает `idempotencyKey: id`, `status`, ISO-время, `tzOffsetMinutes`, и exercises со всеми planned+actual+done.

- [ ] **Step 1: Тест (создание, правка, complete → outbox)**

Создать `mobile/apps/trainer/test/local_workout_test.dart`:

```dart
import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trainer/api/local_workout.dart';

class _FakeStore implements KvStore {
  final Map<String, List<Map<String, dynamic>>> _d = {};
  @override
  Future<List<Map<String, dynamic>>?> readList(String k) async => _d[k];
  @override
  Future<void> writeList(String k, List<Map<String, dynamic>> v) async => _d[k] = v;
}

void main() {
  late _FakeStore store;
  late Outbox outbox;
  late LocalWorkoutController ctrl;
  setUp(() {
    store = _FakeStore();
    outbox = Outbox(store);
    ctrl = LocalWorkoutController(store, outbox);
  });

  LocalSet planned(int reps) => LocalSet(setIndex: 0, plannedReps: reps, plannedRestSec: 90);

  test('createFromPlan создаёт документ и грузится обратно', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'Верх',
      plan: [(exerciseId: 'ex1', name: 'Жим', set: planned(10))],
    );
    expect(w.id, isNotEmpty);
    expect(w.exercises, hasLength(1));
    final again = await ctrl.load(w.id);
    expect(again?.name, 'Верх');
  });

  test('updateSet пишет факт и done', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'В',
      plan: [(exerciseId: 'ex1', name: 'Жим', set: planned(10))],
    );
    await ctrl.updateSet(w, w.exercises.first.position, 0, actualReps: 9, done: true);
    final again = await ctrl.load(w.id);
    expect(again?.exercises.first.sets.first.actualReps, 9);
    expect(again?.exercises.first.sets.first.done, true);
  });

  test('complete → status completed + элемент в Outbox с idempotencyKey=id', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'В',
      plan: [(exerciseId: 'ex1', name: 'Жим', set: planned(10))],
    );
    await ctrl.complete(w, durationSec: 1800);
    expect(w.status, 'completed');
    final q = await outbox.list();
    expect(q, hasLength(1));
    expect(q.first.kind, 'workout.import');
    final doc = (q.first.payload['doc'] as Map).cast<String, dynamic>();
    expect(doc['idempotencyKey'], w.id);
    expect(doc['status'], 'completed');
    expect(q.first.payload['clientId'], 'cl1');
  });

  test('toWorkout отражает документ для UI', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'В',
      plan: [(exerciseId: 'ex1', name: 'Жим', set: planned(12))],
    );
    final ui = w.toWorkout();
    expect(ui.name, 'В');
    expect(ui.exercises.first.sets.first.plannedReps, 12);
  });
}
```

- [ ] **Step 2: Запустить — падает**

Run: `cd mobile/apps/trainer && flutter test test/local_workout_test.dart`
Expected: FAIL — `local_workout.dart` не существует.

- [ ] **Step 3: Реализовать модель и контроллер**

Создать `mobile/apps/trainer/lib/api/local_workout.dart`:

```dart
import 'package:core/core.dart';
import 'package:uuid/uuid.dart';

import 'trainer_workouts.dart';

/// Подход локального документа (план + факт + done). Изменяемый.
class LocalSet {
  LocalSet({
    required this.setIndex,
    this.plannedReps,
    this.plannedWeightKg,
    this.plannedTimeSec,
    this.plannedRestSec,
    this.actualReps,
    this.actualWeightKg,
    this.actualTimeSec,
    this.done = false,
  });
  int setIndex;
  num? plannedReps, plannedWeightKg, plannedTimeSec, plannedRestSec;
  num? actualReps, actualWeightKg, actualTimeSec;
  bool done;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'setIndex': setIndex,
        'plannedReps': plannedReps,
        'plannedWeightKg': plannedWeightKg,
        'plannedTimeSec': plannedTimeSec,
        'plannedRestSec': plannedRestSec,
        'actualReps': actualReps,
        'actualWeightKg': actualWeightKg,
        'actualTimeSec': actualTimeSec,
        'done': done,
      };

  factory LocalSet.fromJson(Map<String, dynamic> j) => LocalSet(
        setIndex: (j['setIndex'] as num?)?.toInt() ?? 0,
        plannedReps: j['plannedReps'] as num?,
        plannedWeightKg: j['plannedWeightKg'] as num?,
        plannedTimeSec: j['plannedTimeSec'] as num?,
        plannedRestSec: j['plannedRestSec'] as num?,
        actualReps: j['actualReps'] as num?,
        actualWeightKg: j['actualWeightKg'] as num?,
        actualTimeSec: j['actualTimeSec'] as num?,
        done: j['done'] as bool? ?? false,
      );

  // Для importWorkoutRequest: planned + actual + done (int→кладём как есть).
  Map<String, dynamic> toImportJson() => <String, dynamic>{
        'plannedReps': plannedReps,
        'plannedWeightKg': plannedWeightKg,
        'plannedTimeSec': plannedTimeSec,
        'plannedRestSec': plannedRestSec,
        'actualReps': actualReps,
        'actualWeightKg': actualWeightKg,
        'actualTimeSec': actualTimeSec,
        'done': done,
      };

  WorkoutSet toWorkoutSet() => WorkoutSet(
        setIndex: setIndex,
        plannedReps: plannedReps,
        plannedWeightKg: plannedWeightKg,
        plannedTimeSec: plannedTimeSec,
        plannedRestSec: plannedRestSec,
        actualReps: actualReps,
        actualWeightKg: actualWeightKg,
        actualTimeSec: actualTimeSec,
        done: done,
      );
}

class LocalExercise {
  LocalExercise({
    required this.position,
    required this.exerciseId,
    required this.name,
    required this.sets,
  });
  int position;
  String exerciseId;
  String name;
  List<LocalSet> sets;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'position': position,
        'exerciseId': exerciseId,
        'name': name,
        'sets': sets.map((s) => s.toJson()).toList(),
      };

  factory LocalExercise.fromJson(Map<String, dynamic> j) => LocalExercise(
        position: (j['position'] as num?)?.toInt() ?? 0,
        exerciseId: j['exerciseId'] as String? ?? '',
        name: j['name'] as String? ?? 'Упражнение',
        sets: ((j['sets'] as List<dynamic>?) ?? const <dynamic>[])
            .cast<Map<String, dynamic>>()
            .map(LocalSet.fromJson)
            .toList(),
      );
}

/// Локальный документ проведённой/проводимой тренировки. Живёт на диске до синка.
class LocalWorkout {
  LocalWorkout({
    required this.id,
    required this.clientId,
    required this.name,
    this.sourceTemplateId,
    this.status = 'draft',
    this.startedAt,
    this.completedAt,
    this.durationSec,
    this.trainerNote,
    this.rpe,
    this.excludedFromBalance = false,
    required this.exercises,
  });

  final String id; // клиентский UUID = idempotencyKey
  final String clientId;
  String name;
  String? sourceTemplateId;
  String status; // 'draft' | 'active' | 'completed'
  DateTime? startedAt, completedAt;
  int? durationSec;
  String? trainerNote;
  num? rpe;
  bool excludedFromBalance;
  List<LocalExercise> exercises;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'clientId': clientId,
        'name': name,
        'sourceTemplateId': sourceTemplateId,
        'status': status,
        'startedAt': startedAt?.toIso8601String(),
        'completedAt': completedAt?.toIso8601String(),
        'durationSec': durationSec,
        'trainerNote': trainerNote,
        'rpe': rpe,
        'excludedFromBalance': excludedFromBalance,
        'exercises': exercises.map((e) => e.toJson()).toList(),
      };

  factory LocalWorkout.fromJson(Map<String, dynamic> j) => LocalWorkout(
        id: j['id'] as String,
        clientId: j['clientId'] as String,
        name: j['name'] as String? ?? 'Тренировка',
        sourceTemplateId: j['sourceTemplateId'] as String?,
        status: j['status'] as String? ?? 'draft',
        startedAt: (j['startedAt'] as String?) != null
            ? DateTime.tryParse(j['startedAt'] as String)
            : null,
        completedAt: (j['completedAt'] as String?) != null
            ? DateTime.tryParse(j['completedAt'] as String)
            : null,
        durationSec: (j['durationSec'] as num?)?.toInt(),
        trainerNote: j['trainerNote'] as String?,
        rpe: j['rpe'] as num?,
        excludedFromBalance: j['excludedFromBalance'] as bool? ?? false,
        exercises: ((j['exercises'] as List<dynamic>?) ?? const <dynamic>[])
            .cast<Map<String, dynamic>>()
            .map(LocalExercise.fromJson)
            .toList(),
      );

  /// Проекция в модель UI (экран проведения рендерит Workout).
  Workout toWorkout() => Workout(
        id: id,
        name: name,
        status: switch (status) {
          'active' => WorkoutStatus.active,
          'completed' => WorkoutStatus.completed,
          _ => WorkoutStatus.draft,
        },
        startedAt: startedAt,
        completedAt: completedAt,
        durationSec: durationSec,
        rpe: rpe,
        trainerNote: trainerNote,
        createdByClient: false,
        excludedFromBalance: excludedFromBalance,
        exercises: exercises
            .map((e) => WorkoutExercise(
                  position: e.position,
                  exerciseId: e.exerciseId,
                  name: e.name,
                  sets: e.sets.map((s) => s.toWorkoutSet()).toList(),
                ))
            .toList(),
      );

  /// Тело importWorkoutRequest (см. @trener/shared).
  Map<String, dynamic> toImportPayload() => <String, dynamic>{
        'idempotencyKey': id,
        'name': name,
        'sourceTemplateId': sourceTemplateId,
        'status': status == 'completed' ? 'completed' : 'skipped',
        'startedAt': startedAt?.toUtc().toIso8601String(),
        'completedAt': completedAt?.toUtc().toIso8601String(),
        'durationSec': durationSec,
        'trainerNote': trainerNote,
        'rpe': rpe,
        'excludedFromBalance': excludedFromBalance,
        'tzOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
        'exercises': exercises
            .map((e) => <String, dynamic>{
                  'exerciseId': e.exerciseId,
                  'sets': e.sets.map((s) => s.toImportJson()).toList(),
                })
            .toList(),
      };
}

/// Хранит/меняет локальные документы тренировок. Персист под ключом
/// `local_workout_<id>`; действия синхронны (без сети). complete → Outbox.
class LocalWorkoutController {
  LocalWorkoutController(this._store, this._outbox, {Uuid uuid = const Uuid()})
      : _uuid = uuid;
  final KvStore _store;
  final Outbox _outbox;
  final Uuid _uuid;

  String _key(String id) => 'local_workout_$id';

  Future<void> _save(LocalWorkout w) => _store.writeList(_key(w.id), [w.toJson()]);

  Future<LocalWorkout?> load(String id) async {
    final raw = await _store.readList(_key(id));
    if (raw == null || raw.isEmpty) return null;
    return LocalWorkout.fromJson(raw.first);
  }

  Future<LocalWorkout> createFromPlan({
    required String clientId,
    required String name,
    String? sourceTemplateId,
    required List<({String exerciseId, String name, LocalSet set})> plan,
  }) async {
    final exercises = <LocalExercise>[];
    for (var i = 0; i < plan.length; i++) {
      final p = plan[i];
      exercises.add(LocalExercise(
        position: i,
        exerciseId: p.exerciseId,
        name: p.name,
        sets: [p.set..setIndex = 0],
      ));
    }
    final w = LocalWorkout(
      id: _uuid.v4(),
      clientId: clientId,
      name: name,
      sourceTemplateId: sourceTemplateId,
      status: 'active',
      startedAt: DateTime.now(),
      exercises: exercises,
    );
    await _save(w);
    return w;
  }

  Future<void> start(LocalWorkout w) async {
    w.status = 'active';
    w.startedAt ??= DateTime.now();
    await _save(w);
  }

  Future<void> updateSet(
    LocalWorkout w,
    int pos,
    int setIndex, {
    num? actualReps,
    num? actualWeightKg,
    num? actualTimeSec,
    num? plannedRestSec,
    bool? done,
    bool clearActuals = false,
  }) async {
    final ex = w.exercises.firstWhere((e) => e.position == pos);
    final s = ex.sets.firstWhere((x) => x.setIndex == setIndex);
    if (actualReps != null) s.actualReps = actualReps;
    if (actualWeightKg != null) s.actualWeightKg = actualWeightKg;
    if (actualTimeSec != null) s.actualTimeSec = actualTimeSec;
    if (plannedRestSec != null) s.plannedRestSec = plannedRestSec;
    if (done != null) s.done = done;
    await _save(w);
  }

  Future<void> addSet(LocalWorkout w, int pos) async {
    final ex = w.exercises.firstWhere((e) => e.position == pos);
    final last = ex.sets.isNotEmpty ? ex.sets.last : null;
    ex.sets.add(LocalSet(
      setIndex: ex.sets.length,
      plannedReps: last?.actualReps ?? last?.plannedReps,
      plannedWeightKg: last?.actualWeightKg ?? last?.plannedWeightKg,
      plannedTimeSec: last?.actualTimeSec ?? last?.plannedTimeSec,
      plannedRestSec: last?.plannedRestSec,
    ));
    await _save(w);
  }

  Future<void> deleteSet(LocalWorkout w, int pos, int setIndex) async {
    final ex = w.exercises.firstWhere((e) => e.position == pos);
    ex.sets.removeWhere((s) => s.setIndex == setIndex);
    for (var i = 0; i < ex.sets.length; i++) {
      ex.sets[i].setIndex = i; // перенумеровать
    }
    // Пустое упражнение удаляем (как делает бэкенд при удалении последнего подхода).
    if (ex.sets.isEmpty) w.exercises.remove(ex);
    _renumberPositions(w);
    await _save(w);
  }

  Future<void> addExercise(
    LocalWorkout w, {
    required String exerciseId,
    required String name,
    required LocalSet set,
  }) async {
    w.exercises.add(LocalExercise(
      position: w.exercises.length,
      exerciseId: exerciseId,
      name: name,
      sets: [set..setIndex = 0],
    ));
    await _save(w);
  }

  Future<void> removeExercise(LocalWorkout w, int pos) async {
    w.exercises.removeWhere((e) => e.position == pos);
    _renumberPositions(w);
    await _save(w);
  }

  Future<void> reorder(LocalWorkout w, List<int> order) async {
    final byPos = {for (final e in w.exercises) e.position: e};
    final next = <LocalExercise>[];
    for (final p in order) {
      final e = byPos[p];
      if (e != null) next.add(e);
    }
    w.exercises = next;
    _renumberPositions(w);
    await _save(w);
  }

  void _renumberPositions(LocalWorkout w) {
    for (var i = 0; i < w.exercises.length; i++) {
      w.exercises[i].position = i;
    }
  }

  /// Завершить: пометить completed и поставить в очередь на импорт.
  Future<void> complete(LocalWorkout w, {int? durationSec}) async {
    w.status = 'completed';
    w.completedAt = DateTime.now();
    w.durationSec = durationSec ??
        (w.startedAt != null
            ? DateTime.now().difference(w.startedAt!).inSeconds
            : null);
    await _save(w);
    await _outbox.enqueue(
      kind: 'workout.import',
      payload: <String, dynamic>{'clientId': w.clientId, 'doc': w.toImportPayload()},
    );
  }
}
```

- [ ] **Step 4: Зелёный + анализ**

Run: `cd mobile/apps/trainer && flutter test test/local_workout_test.dart && flutter analyze`
Expected: 4 теста PASS, `No issues found!`.

- [ ] **Step 5: Коммит**

```bash
git add mobile/apps/trainer/lib/api/local_workout.dart mobile/apps/trainer/test/local_workout_test.dart
git commit -m "feat(offline): LocalWorkout + LocalWorkoutController (локальный документ + очередь на импорт)"
```

_(Убедиться, что `uuid` добавлен в `mobile/apps/trainer/pubspec.yaml` — если нет, добавить `uuid: ^4.5.1` и `flutter pub get`.)_

---

### Task 3: Офлайн-провайдеры (kvStore, outbox, isOnline, syncEngine)

**Files:**

- Create: `mobile/apps/trainer/lib/api/offline_providers.dart`
- Test: `mobile/apps/trainer/test/sync_handler_test.dart`

**Interfaces:**

- Consumes: `LocalJsonStore` (как `KvStore`), `Outbox`, `SyncEngine`, `NetworkStatus`, `isOfflineError`, `TrainerWorkoutsApi.importWorkout`.
- Produces:
  - `final kvStoreProvider = Provider<KvStore>((ref) => LocalJsonStore.instance);`
  - `final outboxProvider = Provider<Outbox>((ref) => Outbox(ref.read(kvStoreProvider)));`
  - `final localWorkoutControllerProvider = Provider<LocalWorkoutController>(...);`
  - `final isOnlineProvider = StreamProvider<bool>(...)` — connectivity_plus + проба API.
  - `final syncEngineProvider = Provider<SyncEngine>(...)` — с обработчиком `'workout.import'`.
  - `final syncStatusProvider = FutureProvider<int>(...)` — число элементов в очереди (для индикатора).
  - `Future<void> drainOnline(Ref ref)` — вызвать слив (дёргается при online и после enqueue).

- [ ] **Step 1: Тест обработчика `workout.import`**

Обработчик должен звать `importWorkout(clientId, doc)`. Тестируем чистую функцию-обработчик. Создать `mobile/apps/trainer/test/sync_handler_test.dart`:

```dart
import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trainer/api/offline_providers.dart';

void main() {
  test('workoutImportHandler зовёт sender с clientId и doc', () async {
    String? gotClient;
    Map<String, dynamic>? gotDoc;
    final handler = makeWorkoutImportHandler((clientId, doc) async {
      gotClient = clientId;
      gotDoc = doc;
    });
    final item = OutboxItem(
      id: 'i1',
      kind: 'workout.import',
      createdAt: 0,
      payload: {
        'clientId': 'cl1',
        'doc': {'idempotencyKey': 'w1', 'status': 'completed'},
      },
    );
    await handler(item);
    expect(gotClient, 'cl1');
    expect(gotDoc?['idempotencyKey'], 'w1');
  });
}
```

- [ ] **Step 2: Запустить — падает**

Run: `cd mobile/apps/trainer && flutter test test/sync_handler_test.dart`
Expected: FAIL — `offline_providers.dart` / `makeWorkoutImportHandler` нет.

- [ ] **Step 3: Реализовать провайдеры**

Создать `mobile/apps/trainer/lib/api/offline_providers.dart`:

```dart
import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'local_workout.dart';
import 'trainer_workouts.dart';

/// Обработчик элемента 'workout.import': достаёт clientId+doc и шлёт через sender.
/// Выделен для тестируемости (sender инъектируется).
SyncHandler makeWorkoutImportHandler(
  Future<void> Function(String clientId, Map<String, dynamic> doc) sender,
) {
  return (OutboxItem item) async {
    final clientId = item.payload['clientId'] as String;
    final doc = (item.payload['doc'] as Map).cast<String, dynamic>();
    await sender(clientId, doc);
  };
}

final kvStoreProvider = Provider<KvStore>((ref) => LocalJsonStore.instance);

final outboxProvider = Provider<Outbox>((ref) => Outbox(ref.read(kvStoreProvider)));

final localWorkoutControllerProvider = Provider<LocalWorkoutController>(
  (ref) => LocalWorkoutController(ref.read(kvStoreProvider), ref.read(outboxProvider)),
);

/// online = есть сетевой интерфейс И бэкенд реально отвечает. Пересчёт при смене
/// connectivity и раз в 20 c (на случай «Wi-Fi есть, интернета нет»).
final isOnlineProvider = StreamProvider<bool>((ref) async* {
  final api = ref.read(apiClientProvider);
  Future<bool> reachable() async {
    try {
      // Любой ответ (даже 401/404) = сервер достижим. Ошибка сети → офлайн.
      await api.getJson('/api/ping');
      return true;
    } catch (e) {
      return !isOfflineError(e);
    }
  }

  final ns = NetworkStatus(
    hasInterface: () async =>
        !(await Connectivity().checkConnectivity()).contains(ConnectivityResult.none),
    reachable: reachable,
  );

  yield await ns.isOnline();
  final sub = Connectivity().onConnectivityChanged;
  final ticker = Stream<void>.periodic(const Duration(seconds: 20));
  await for (final _ in StreamGroup.merge([sub.map((_) {}), ticker])) {
    final online = await ns.isOnline();
    yield online;
    if (online) unawaited(drainOnline(ref));
  }
});

final syncEngineProvider = Provider<SyncEngine>((ref) {
  final api = ref.read(trainerWorkoutsApiProvider);
  return SyncEngine(
    ref.read(outboxProvider),
    isOffline: isOfflineError,
    handlers: {
      'workout.import': makeWorkoutImportHandler(api.importWorkout),
    },
  );
});

/// Число элементов в очереди (для индикатора «N ждут отправки»).
final syncStatusProvider = FutureProvider<int>((ref) async {
  ref.watch(_syncTick);
  final items = await ref.read(outboxProvider).list();
  return items.length;
});

// Тик для перечитывания статуса после enqueue/слива.
final _syncTick = StateProvider<int>((ref) => 0);

/// Слить очередь (при online и после enqueue). Обновляет индикатор.
Future<void> drainOnline(Ref ref) async {
  await ref.read(syncEngineProvider).drain();
  ref.read(_syncTick.notifier).state++;
  ref.invalidate(syncStatusProvider);
}
```

> Для `StreamGroup` добавить в `pubspec.yaml` `async: ^2.11.0` (или заменить на
> простой `Timer.periodic` + `Connectivity().onConnectivityChanged.listen` через
> `StreamController`, если не хочется зависимости). `/api/ping` — если такого роута
> нет, используй существующий лёгкий GET (напр. `/api/me`) или добавь публичный
> `/api/ping` в бэкенд (аддитивно). Уточнить у соседних вызовов apiClient.

- [ ] **Step 4: Зелёный + анализ**

Run: `cd mobile/apps/trainer && flutter test test/sync_handler_test.dart && flutter analyze`
Expected: PASS, `No issues found!` (устранить возможные варнинги по неиспользуемым импортам).

- [ ] **Step 5: Коммит**

```bash
git add mobile/apps/trainer/lib/api/offline_providers.dart mobile/apps/trainer/test/sync_handler_test.dart mobile/apps/trainer/pubspec.yaml
git commit -m "feat(offline): провайдеры движка (kvStore/outbox/isOnline/syncEngine) в тренере"
```

---

### Task 4: Cache-first клиенты и шаблоны

**Files:**

- Modify: `mobile/apps/trainer/lib/api/trainer_clients.dart:296-297` (`trainerClientsProvider`)
- Modify: `mobile/apps/trainer/lib/api/trainer_catalog.dart:157-158` (`trainerTemplatesProvider`)
- Test: existing (провайдеры покрываются вручную; `CachedListNotifier` уже протестирован в Плане 2)

**Interfaces:**

- Consumes: `CachedListNotifier` (core), `kvStoreProvider`.
- Produces: те же провайдеры `trainerClientsProvider` / `trainerTemplatesProvider`, но cache-first (тип остаётся `AsyncValue<List<...>>` — потребители не меняются).

- [ ] **Step 1: Перевести `trainerTemplatesProvider` на CachedListNotifier**

Заменить в `trainer_catalog.dart` (стр. 157-158) провайдер на нотифаер поверх сырого ответа. `catalogRaw`-аналог: в `TrainerCatalogApi` уже есть `templates()` — нужен доступ к СЫРЫМ json. Добавить в `TrainerCatalogApi` метод `templatesRaw()`:

```dart
  Future<List<Map<String, dynamic>>> templatesRaw() async {
    final Map<String, dynamic> r = await _api.getJson('/api/workout-templates');
    return ((r['templates'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>();
  }
```

И заменить провайдер:

```dart
class TrainerTemplatesNotifier extends CachedListNotifier<WorkoutTemplate> {
  @override
  String get cacheKey => 'trainer_templates';
  @override
  KvStore get store => ref.read(kvStoreProvider);
  @override
  Future<List<Map<String, dynamic>>> fetchRaw() =>
      ref.read(trainerCatalogApiProvider).templatesRaw();
  @override
  List<WorkoutTemplate> parse(List<Map<String, dynamic>> raw) {
    final list = raw.map(WorkoutTemplate.fromJson).toList();
    list.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return list;
  }
}

final trainerTemplatesProvider =
    AsyncNotifierProvider<TrainerTemplatesNotifier, List<WorkoutTemplate>>(
        TrainerTemplatesNotifier.new);
```

Добавить импорт `offline_providers.dart` (для `kvStoreProvider`) в шапке файла.

- [ ] **Step 2: Перевести `trainerClientsProvider` на CachedListNotifier**

Аналогично в `trainer_clients.dart`: добавить `clientsRaw()` в API-класс (сырой список из `/api/clients`), затем:

```dart
class TrainerClientsNotifier extends CachedListNotifier<Client> {
  @override
  String get cacheKey => 'trainer_clients';
  @override
  KvStore get store => ref.read(kvStoreProvider);
  @override
  Future<List<Map<String, dynamic>>> fetchRaw() =>
      ref.read(trainerClientsApiProvider).clientsRaw();
  @override
  List<Client> parse(List<Map<String, dynamic>> raw) =>
      raw.map(Client.fromJson).toList();
}

final trainerClientsProvider =
    AsyncNotifierProvider<TrainerClientsNotifier, List<Client>>(
        TrainerClientsNotifier.new);
```

(Взять фактические имена `Client.fromJson` / сортировку из текущего `load()`; повторить их в `parse`.)

- [ ] **Step 3: Анализ + сборка**

Run: `cd mobile/apps/trainer && flutter analyze`
Expected: `No issues found!` (потребители `trainerClientsProvider`/`trainerTemplatesProvider` не меняются — тип `AsyncValue<List<...>>` тот же).

- [ ] **Step 4: Коммит**

```bash
git add mobile/apps/trainer/lib/api/trainer_catalog.dart mobile/apps/trainer/lib/api/trainer_clients.dart
git commit -m "feat(offline): клиенты и шаблоны — cache-first (доступны офлайн)"
```

---

### Task 5: Перецепить `ActiveWorkoutScreen` на локальный документ (интеграция)

**Files:**

- Modify: `mobile/apps/trainer/lib/screens/active_workout_screen.dart` (замена источника данных и действий)
- Modify: точки создания тренировки в `mobile/apps/trainer/lib/screens/clients_screen.dart` (передавать локальный документ вместо серверного id)

**Это одна интеграционная задача (один ревью-гейт): переносим проведение с прямых `_api`-вызовов на `LocalWorkoutController`.** Реализатор ЧИТАЕТ текущий экран и делает замену по карте ниже. Тест — ручной сквозной (в конце), т.к. это рефактор UI-состояния.

**Interfaces:**

- Consumes: `LocalWorkoutController`, `LocalWorkout`, `localWorkoutControllerProvider` (Task 3), `LocalWorkout.toWorkout()` (Task 2).

- [ ] **Step 1: Экран принимает локальный документ**

`ActiveWorkoutScreen` сейчас грузит серверную `Workout` по `(clientId, workoutId)` (через `trainerWorkoutProvider`) и держит `_w`. Заменить источник: экран принимает `localWorkoutId` (String), в `initState`/`build` грузит `LocalWorkout` через `localWorkoutControllerProvider.load(id)`, держит `LocalWorkout _doc`, а `_w` вычисляет как `_doc.toWorkout()` для рендера. Это даёт **resume**: убил приложение — при открытии документ восстановится с диска.

- [ ] **Step 2: Заменить действия по карте**

Каждый прежний `await _run(() => _api.METHOD(...))` заменить на синхронный вызов контроллера + `setState`. Карта замен (левое — текущий вызов, правое — новый):

| Было (`_api` / `_run`)                     | Стало (`_ctrl` = localWorkoutControllerProvider)                                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_api.updateSet(cid, wid, pos, idx, body)` | `_ctrl.updateSet(_doc, pos, idx, actualReps:…, actualWeightKg:…, actualTimeSec:…, plannedRestSec:…, done:…)` (маппинг полей body)                                                                                             |
| `_api.addSet(cid, wid, pos, s)`            | `_ctrl.addSet(_doc, pos)`                                                                                                                                                                                                     |
| `_api.deleteSet(cid, wid, pos, idx)`       | `_ctrl.deleteSet(_doc, pos, idx)`                                                                                                                                                                                             |
| `_api.addExercise(cid, wid, ex)`           | `_ctrl.addExercise(_doc, exerciseId: ex.id, name: ex.name, set: LocalSet(setIndex:0, plannedReps: ex.defaultReps, plannedWeightKg: ex.defaultWeightKg, plannedTimeSec: ex.defaultTimeSec, plannedRestSec: ex.restSec ?? 90))` |
| `_api.removeExercise(cid, wid, pos)`       | `_ctrl.removeExercise(_doc, pos)`                                                                                                                                                                                             |
| `_api.reorderExercises(cid, wid, order)`   | `_ctrl.reorder(_doc, order)`                                                                                                                                                                                                  |
| `_api.start(cid, wid)`                     | `_ctrl.start(_doc)`                                                                                                                                                                                                           |
| `_api.complete(cid, wid, durationSec:…)`   | `_ctrl.complete(_doc, durationSec:…)` (кладёт в Outbox; затем `unawaited(drainOnline(ref))`)                                                                                                                                  |

После каждого вызова — `setState(() {})` (документ уже персистнут контроллером). `_run` можно упростить/удалить (действия синхронны, нет спиннера/сети). Инлайн-редактирование метрик (`_startEditMetric`/`_saveMetricValue`) переводится на `_ctrl.updateSet` тем же способом.

- [ ] **Step 3: Создание тренировки → локальный документ**

В `clients_screen.dart` точки, которые сейчас зовут `_createAndOpen`/`assignReturningId` и затем открывают `ActiveWorkoutScreen(clientId, workoutId)`, заменить на: создать локальный документ `localWorkoutControllerProvider.createFromPlan(clientId:…, name:…, sourceTemplateId:…, plan:[…])` (план из выбранного шаблона/из истории/пустой) и открыть `ActiveWorkoutScreen(localWorkoutId: doc.id)`. Гейт согласования (`_canConductNow`) при офлайн-создании НЕ применяем (проверка была про живое проведение; офлайн — по возврату связи импорт сам решит через баланс). «Ближайшая наверху» (черновик) в офлайне не нужна — проведение идёт по локальному документу.

- [ ] **Step 4: Ручная сквозная проверка (авиарежим)**

Собрать и на устройстве в авиарежиме: выбрать шаблон → провести (отметки/правки/+1/удаление/добавить упражнение) → завершить. Проверить: всё работает без сети, документ не теряется; убить приложение посреди → переоткрыть → тренировка на месте (resume). Вернуть связь → тренировка ушла (индикатор «0 ждут»), появилась в истории клиента на сервере. Повторный синк не дублирует.

- [ ] **Step 5: Коммит**

```bash
git add mobile/apps/trainer/lib/screens/active_workout_screen.dart mobile/apps/trainer/lib/screens/clients_screen.dart
git commit -m "feat(offline): проведение тренировки через локальный документ (offline-first)"
```

---

### Task 6: UI — баннер офлайна + индикатор синка

**Files:**

- Create: `mobile/apps/trainer/lib/widgets/offline_banner.dart`
- Modify: главный шелл-виджет (где `Scaffold`/нижнее меню) — вставить баннер сверху. Найти через `GlobalNavBar` / корневой каркас в `mobile/apps/trainer/lib/`.

**Interfaces:**

- Consumes: `isOnlineProvider`, `syncStatusProvider` (Task 3).

- [ ] **Step 1: Виджет**

Создать `mobile/apps/trainer/lib/widgets/offline_banner.dart`:

```dart
import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/offline_providers.dart';

/// Тонкая полоса статуса связи/синка. Скрыта, когда онлайн и очередь пуста.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final bool online = ref.watch(isOnlineProvider).valueOrNull ?? true;
    final int pending = ref.watch(syncStatusProvider).valueOrNull ?? 0;

    if (online && pending == 0) return const SizedBox.shrink();

    final (IconData icon, String text, Color bg) = online
        ? (Icons.sync, 'Синхронизация… ($pending)', c.chip)
        : (Icons.cloud_off_outlined,
            pending > 0
                ? 'Офлайн — $pending изменений отправятся при связи'
                : 'Офлайн — изменения сохранятся и отправятся при связи',
            c.chip);

    return Container(
      width: double.infinity,
      color: bg,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      child: Row(
        children: <Widget>[
          Icon(icon, size: 16, color: c.inkMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: TextStyle(fontSize: 12, color: c.inkMuted, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Вставить в каркас**

Найти корневой шелл (там, где `GlobalNavBar` и общий `Scaffold` для табов) и обернуть контент: `Column(children: [const OfflineBanner(), Expanded(child: <текущий контент>)])`, чтобы баннер был над контентом на всех вкладках. (Точное место — по структуре `main.dart`/шелла тренера; реализатор смотрит текущий каркас.)

- [ ] **Step 3: Анализ + ручная проверка**

Run: `cd mobile/apps/trainer && flutter analyze`
Expected: `No issues found!`. Ручной: включить авиарежим → появляется «Офлайн»; провести тренировку → «N отправятся при связи»; вернуть связь → «Синхронизация…» → скрылось.

- [ ] **Step 4: Коммит**

```bash
git add mobile/apps/trainer/lib/widgets/offline_banner.dart mobile/apps/trainer/lib/<файл-каркаса>
git commit -m "feat(offline): баннер офлайна + индикатор синка"
```

---

## Итог Плана 3

После Планов 1–3 тренер полностью проводит тренировку офлайн: локальный документ (resume при перезапуске), синк одним идемпотентным импортом при возврате связи, cache-first клиенты/шаблоны, баннер/индикатор. Это закрывает зальную боль «нет связи с начала». Дальнейшие домены (замеры, финансы) подключаются к тому же движку отдельными фазами.

**Порядок исполнения:** План 1 (бэкенд) → План 2 (движок) → План 3 (провод). Планы 1 и 2 независимы и тестируются отдельно; План 3 зависит от обоих.

**Деплой:** пуш в master авто-раскатывает бэкенд Плана 1. Мобильные Планы 2–3 доезжают до тренеров только сборкой APK/IPA — по явной просьбе.
