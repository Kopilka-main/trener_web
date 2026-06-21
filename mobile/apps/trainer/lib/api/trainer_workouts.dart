import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'trainer_assign.dart';

/// Статус тренировки (зеркало workoutStatusSchema).
enum WorkoutStatus { draft, active, completed, skipped, unknown }

WorkoutStatus _statusFrom(String? s) => switch (s) {
      'draft' => WorkoutStatus.draft,
      'active' => WorkoutStatus.active,
      'completed' => WorkoutStatus.completed,
      'skipped' => WorkoutStatus.skipped,
      _ => WorkoutStatus.unknown,
    };

/// Подход упражнения (план + факт).
class WorkoutSet {
  WorkoutSet({
    required this.setIndex,
    required this.plannedReps,
    required this.plannedWeightKg,
    required this.plannedTimeSec,
    required this.plannedRestSec,
    required this.actualReps,
    required this.actualWeightKg,
    required this.actualTimeSec,
    required this.done,
  });

  final int setIndex;
  final num? plannedReps;
  final num? plannedWeightKg;
  final num? plannedTimeSec;
  final num? plannedRestSec;
  final num? actualReps;
  final num? actualWeightKg;
  final num? actualTimeSec;
  final bool done;

  bool get hasFact => actualReps != null || actualWeightKg != null || actualTimeSec != null;

  factory WorkoutSet.fromJson(Map<String, dynamic> j) => WorkoutSet(
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
}

/// Упражнение тренировки с набором подходов.
class WorkoutExercise {
  WorkoutExercise({
    required this.position,
    required this.exerciseId,
    required this.name,
    required this.sets,
  });
  final int position;
  final String exerciseId;
  final String name;
  final List<WorkoutSet> sets;

  factory WorkoutExercise.fromJson(Map<String, dynamic> j) => WorkoutExercise(
        position: (j['position'] as num?)?.toInt() ?? 0,
        exerciseId: j['exerciseId'] as String? ?? '',
        name: j['exerciseName'] as String? ?? 'Упражнение',
        sets: ((j['sets'] as List<dynamic>?) ?? <dynamic>[])
            .cast<Map<String, dynamic>>()
            .map(WorkoutSet.fromJson)
            .toList(),
      );
}

/// Тренировка (зеркало workoutResponseSchema).
class Workout {
  Workout({
    required this.id,
    required this.name,
    required this.status,
    required this.startedAt,
    required this.completedAt,
    required this.durationSec,
    required this.rpe,
    required this.trainerNote,
    required this.createdByClient,
    required this.exercises,
  });

  final String id;
  final String name;
  final WorkoutStatus status;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final int? durationSec;
  final num? rpe;
  final String? trainerNote;
  final bool createdByClient;
  final List<WorkoutExercise> exercises;

  factory Workout.fromJson(Map<String, dynamic> j) {
    final String? ca = j['completedAt'] as String?;
    final String? sa = j['startedAt'] as String?;
    return Workout(
      id: j['id'] as String? ?? '',
      name: (j['name'] as String? ?? '').trim().isNotEmpty ? j['name'] as String : 'Тренировка',
      status: _statusFrom(j['status'] as String?),
      startedAt: sa != null ? DateTime.tryParse(sa)?.toLocal() : null,
      completedAt: ca != null ? DateTime.tryParse(ca)?.toLocal() : null,
      durationSec: (j['durationSec'] as num?)?.toInt(),
      rpe: j['rpe'] as num?,
      trainerNote: j['trainerNote'] as String?,
      createdByClient: j['createdByClient'] as bool? ?? false,
      exercises: ((j['exercises'] as List<dynamic>?) ?? <dynamic>[])
          .cast<Map<String, dynamic>>()
          .map(WorkoutExercise.fromJson)
          .toList(),
    );
  }
}

/// Проведение тренировки клиента тренером: загрузка, старт, лог подходов,
/// добавление/удаление/перестановка упражнений, завершение.
/// Эндпоинты тренерского scope: /api/clients/:id/workouts/:wid/...
class TrainerWorkoutsApi {
  TrainerWorkoutsApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  String _base(String clientId, String wid) => '/api/clients/$clientId/workouts/$wid';

  Future<Workout> _unwrap(Map<String, dynamic> r) =>
      Future<Workout>.value(Workout.fromJson((r['workout'] as Map<String, dynamic>?) ?? <String, dynamic>{}));

  Future<Workout> fetch(String clientId, String wid) async {
    final Map<String, dynamic> r = await _api.getJson(_base(clientId, wid));
    return _unwrap(r);
  }

  Future<Workout> start(String clientId, String wid) async {
    final Map<String, dynamic> r = await _api.postJson('${_base(clientId, wid)}/start');
    return _unwrap(r);
  }

  /// Обновить подход. Тренерский путь: /exercises/:pos/sets/:idx.
  Future<Workout> updateSet(
    String clientId,
    String wid,
    int position,
    int setIndex,
    Map<String, dynamic> body,
  ) async {
    final Map<String, dynamic> r =
        await _api.patchJson('${_base(clientId, wid)}/exercises/$position/sets/$setIndex', body);
    return _unwrap(r);
  }

  /// Добавить упражнение одним плановым подходом из дефолтов каталога.
  Future<Workout> addExercise(String clientId, String wid, TExercise ex) async {
    final Map<String, dynamic> r = await _api.postJson(
      '${_base(clientId, wid)}/exercises',
      <String, dynamic>{
        'exerciseId': ex.id,
        'sets': <Map<String, dynamic>>[ex.plannedSet()],
      },
    );
    return _unwrap(r);
  }

  Future<Workout> removeExercise(String clientId, String wid, int position) async {
    final Map<String, dynamic> r =
        await _api.deleteJson('${_base(clientId, wid)}/exercises/$position');
    return _unwrap(r);
  }

  /// Переставить упражнения (order — старые позиции в новом порядке).
  Future<Workout> reorderExercises(String clientId, String wid, List<int> order) async {
    final Map<String, dynamic> r = await _api.patchJson(
      '${_base(clientId, wid)}/exercises',
      <String, dynamic>{'order': order},
    );
    return _unwrap(r);
  }

  Future<Workout> complete(String clientId, String wid, {int? durationSec}) async {
    final Map<String, dynamic> r = await _api.postJson(
      '${_base(clientId, wid)}/complete',
      <String, dynamic>{'durationSec': ?durationSec, 'rpe': null, 'trainerNote': null},
    );
    return _unwrap(r);
  }
}

final Provider<TrainerWorkoutsApi> trainerWorkoutsApiProvider =
    Provider<TrainerWorkoutsApi>((ref) => TrainerWorkoutsApi(ref));

/// Полная тренировка по (clientId, wid) — для экрана проведения.
final FutureProviderFamily<Workout, ({String clientId, String wid})> trainerWorkoutProvider =
    FutureProvider.family<Workout, ({String clientId, String wid})>(
        (ref, ({String clientId, String wid}) k) =>
            ref.read(trainerWorkoutsApiProvider).fetch(k.clientId, k.wid));
