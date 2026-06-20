import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    required this.actualReps,
    required this.actualWeightKg,
    required this.actualTimeSec,
    required this.done,
  });

  final int setIndex;
  final num? plannedReps;
  final num? plannedWeightKg;
  final num? plannedTimeSec;
  final num? actualReps;
  final num? actualWeightKg;
  final num? actualTimeSec;
  final bool done;

  factory WorkoutSet.fromJson(Map<String, dynamic> j) => WorkoutSet(
        setIndex: (j['setIndex'] as num?)?.toInt() ?? 0,
        plannedReps: j['plannedReps'] as num?,
        plannedWeightKg: j['plannedWeightKg'] as num?,
        plannedTimeSec: j['plannedTimeSec'] as num?,
        actualReps: j['actualReps'] as num?,
        actualWeightKg: j['actualWeightKg'] as num?,
        actualTimeSec: j['actualTimeSec'] as num?,
        done: j['done'] as bool? ?? false,
      );
}

/// Упражнение тренировки с набором подходов.
class WorkoutExercise {
  WorkoutExercise({required this.position, required this.name, required this.sets});
  final int position;
  final String name;
  final List<WorkoutSet> sets;

  factory WorkoutExercise.fromJson(Map<String, dynamic> j) => WorkoutExercise(
        position: (j['position'] as num?)?.toInt() ?? 0,
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
  final DateTime? completedAt;
  final int? durationSec;
  final num? rpe;
  final String? trainerNote;
  final bool createdByClient;
  final List<WorkoutExercise> exercises;

  factory Workout.fromJson(Map<String, dynamic> j) {
    final String? ca = j['completedAt'] as String?;
    return Workout(
      id: j['id'] as String? ?? '',
      name: (j['name'] as String? ?? '').trim().isNotEmpty ? j['name'] as String : 'Тренировка',
      status: _statusFrom(j['status'] as String?),
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

  int get totalSets => exercises.fold<int>(0, (int a, WorkoutExercise e) => a + e.sets.length);
}

/// Доступ к тренировкам клиента: список (назначенные + история).
class ClientWorkoutsApi {
  ClientWorkoutsApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<Workout>> load() async {
    final Map<String, dynamic> r = await _api.getJson('/api/client/workouts');
    final List<Workout> list = ((r['workouts'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(Workout.fromJson)
        .toList();
    // Свежие завершённые — выше; черновики — по имени.
    list.sort((Workout a, Workout b) =>
        (b.completedAt ?? DateTime.fromMillisecondsSinceEpoch(0))
            .compareTo(a.completedAt ?? DateTime.fromMillisecondsSinceEpoch(0)));
    return list;
  }
}

final Provider<ClientWorkoutsApi> clientWorkoutsApiProvider =
    Provider<ClientWorkoutsApi>((ref) => ClientWorkoutsApi(ref));

final FutureProvider<List<Workout>> clientWorkoutsProvider =
    FutureProvider<List<Workout>>((ref) => ref.read(clientWorkoutsApiProvider).load());
