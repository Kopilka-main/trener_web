import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Упражнение каталога тренера (для назначения тренировки).
class TExercise {
  TExercise({
    required this.id,
    required this.name,
    required this.category,
    required this.subgroup,
    required this.defaultReps,
    required this.defaultWeightKg,
    required this.defaultTimeSec,
    required this.restSec,
    this.description,
    this.equipment,
    this.primaryMuscles,
    this.secondaryMuscles,
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

  factory TExercise.fromJson(Map<String, dynamic> j) => TExercise(
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

  /// Один плановый подход из дефолтов (время в приоритете, иначе повторы+вес; + отдых).
  Map<String, dynamic> plannedSet() {
    final Map<String, dynamic> s = <String, dynamic>{};
    if (defaultTimeSec != null) {
      s['plannedTimeSec'] = defaultTimeSec;
    } else {
      if (defaultReps != null) s['plannedReps'] = defaultReps;
      if (defaultWeightKg != null) s['plannedWeightKg'] = defaultWeightKg;
    }
    if (restSec != null) s['plannedRestSec'] = restSec;
    return s;
  }
}

class TrainerAssignApi {
  TrainerAssignApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<TExercise>> catalog() async {
    final Map<String, dynamic> r = await _api.getJson('/api/exercises');
    final List<TExercise> list = ((r['exercises'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(TExercise.fromJson)
        .toList();
    list.sort((TExercise a, TExercise b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return list;
  }

  /// Назначить тренировку клиенту: создать черновик с планом
  /// (POST /api/clients/:id/workouts). Клиент увидит её в «Назначено тренером».
  Future<void> assign(String clientId, String name, List<Map<String, dynamic>> exercises) async {
    await _api.postJson(
      '/api/clients/$clientId/workouts',
      <String, dynamic>{'name': name, 'exercises': exercises},
    );
  }
}

final Provider<TrainerAssignApi> trainerAssignApiProvider =
    Provider<TrainerAssignApi>((ref) => TrainerAssignApi(ref));

final FutureProvider<List<TExercise>> trainerCatalogProvider =
    FutureProvider<List<TExercise>>((ref) => ref.read(trainerAssignApiProvider).catalog());
