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
      // ignore: prefer_initializing_formals
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
