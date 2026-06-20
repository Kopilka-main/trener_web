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

  int get totalSets => exercises.fold<int>(0, (int a, WorkoutExercise e) => a + e.sets.length);
}

/// Упражнение из каталога (для добавления в свою тренировку + карточка инфо).
class CatalogExercise {
  CatalogExercise({
    required this.id,
    required this.name,
    required this.category,
    required this.subgroup,
    required this.defaultReps,
    required this.defaultWeightKg,
    required this.defaultTimeSec,
    required this.restSec,
    required this.description,
    required this.equipment,
    required this.primaryMuscles,
    required this.secondaryMuscles,
  });

  final String id;
  final String name;
  final String category;
  final String? subgroup;
  final num? defaultReps;
  final num? defaultWeightKg;
  final num? defaultTimeSec;
  final num? restSec;
  final String? description;
  final String? equipment;
  final String? primaryMuscles;
  final String? secondaryMuscles;

  factory CatalogExercise.fromJson(Map<String, dynamic> j) => CatalogExercise(
        id: j['id'] as String? ?? '',
        name: j['name'] as String? ?? 'Упражнение',
        category: j['category'] as String? ?? '',
        subgroup: j['subgroup'] as String?,
        defaultReps: j['defaultReps'] as num?,
        defaultWeightKg: j['defaultWeightKg'] as num?,
        defaultTimeSec: j['defaultTimeSec'] as num?,
        restSec: j['restSec'] as num?,
        description: j['description'] as String?,
        equipment: j['equipment'] as String?,
        primaryMuscles: j['primaryMuscles'] as String?,
        secondaryMuscles: j['secondaryMuscles'] as String?,
      );
}

/// Доступ к тренировкам клиента: список, каталог и весь цикл проведения
/// собственной тренировки (создать → добавить упражнения → старт → лог → завершить).
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

  Future<Workout> _unwrap(Map<String, dynamic> r) =>
      Future<Workout>.value(Workout.fromJson((r['workout'] as Map<String, dynamic>?) ?? <String, dynamic>{}));

  Future<List<CatalogExercise>> catalog() async {
    final Map<String, dynamic> r = await _api.getJson('/api/client/exercises');
    final List<CatalogExercise> list = ((r['exercises'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(CatalogExercise.fromJson)
        .toList();
    list.sort((CatalogExercise a, CatalogExercise b) =>
        a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return list;
  }

  /// Создать пустую собственную тренировку (draft, createdByClient).
  Future<Workout> create(String name) => createFromPlan(name, <Map<String, dynamic>>[]);

  /// Создать собственную тренировку по готовому плану (шаблон/повтор).
  Future<Workout> createFromPlan(String name, List<Map<String, dynamic>> exercises) async {
    final Map<String, dynamic> r = await _api.postJson(
      '/api/client/workouts',
      <String, dynamic>{'name': name, 'exercises': exercises},
    );
    return _unwrap(r);
  }

  Future<void> deleteWorkout(String wid) async {
    await _api.deleteJson('/api/client/workouts/$wid');
  }

  /// Переставить упражнения (order — старые позиции в новом порядке).
  Future<Workout> reorderExercises(String wid, List<int> order) async {
    final Map<String, dynamic> r = await _api.patchJson(
      '/api/client/workouts/$wid/exercises',
      <String, dynamic>{'order': order},
    );
    return _unwrap(r);
  }

  Future<Workout> removeExercise(String wid, int position) async {
    final Map<String, dynamic> r =
        await _api.deleteJson('/api/client/workouts/$wid/exercises/$position');
    return _unwrap(r);
  }

  /// Добавить упражнение одним плановым подходом из дефолтов каталога
  /// (зеркало buildPlannedSet: время в приоритете, иначе повторы+вес; плюс отдых).
  Future<Workout> addExercise(String wid, CatalogExercise ex) async {
    final Map<String, dynamic> set = <String, dynamic>{};
    if (ex.defaultTimeSec != null) {
      set['plannedTimeSec'] = ex.defaultTimeSec;
    } else {
      if (ex.defaultReps != null) set['plannedReps'] = ex.defaultReps;
      if (ex.defaultWeightKg != null) set['plannedWeightKg'] = ex.defaultWeightKg;
    }
    if (ex.restSec != null) set['plannedRestSec'] = ex.restSec;
    final Map<String, dynamic> r = await _api.postJson(
      '/api/client/workouts/$wid/exercises',
      <String, dynamic>{'exerciseId': ex.id, 'sets': <Map<String, dynamic>>[set]},
    );
    return _unwrap(r);
  }

  Future<Workout> start(String wid) async {
    final Map<String, dynamic> r = await _api.postJson('/api/client/workouts/$wid/start');
    return _unwrap(r);
  }

  /// Обновить подход (position:setIndex). Любое поле опционально: факт
  /// (повторы/вес/время), план (для редактора черновика) и/или отметку.
  /// nullable-поля передаём через [body] явно, чтобы можно было ОЧИСТИТЬ значение
  /// (null отправляется на сервер, а не опускается).
  Future<Workout> updateSet(
    String wid,
    int position,
    int setIndex,
    Map<String, dynamic> body,
  ) async {
    final Map<String, dynamic> r =
        await _api.patchJson('/api/client/workouts/$wid/sets/$position:$setIndex', body);
    return _unwrap(r);
  }

  Future<Workout> complete(String wid, {int? durationSec, int? rpe}) async {
    final Map<String, dynamic> r = await _api.postJson(
      '/api/client/workouts/$wid/complete',
      <String, dynamic>{'durationSec': ?durationSec, 'rpe': ?rpe},
    );
    return _unwrap(r);
  }
}

final Provider<ClientWorkoutsApi> clientWorkoutsApiProvider =
    Provider<ClientWorkoutsApi>((ref) => ClientWorkoutsApi(ref));

final FutureProvider<List<Workout>> clientWorkoutsProvider =
    FutureProvider<List<Workout>>((ref) => ref.read(clientWorkoutsApiProvider).load());

final FutureProvider<List<CatalogExercise>> clientCatalogProvider =
    FutureProvider<List<CatalogExercise>>((ref) => ref.read(clientWorkoutsApiProvider).catalog());
