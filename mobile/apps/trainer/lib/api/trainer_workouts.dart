import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'active_workout_pointer.dart';
import 'offline_providers.dart';
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
    required this.excludedFromBalance,
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
  // Историческая запись (постфактум): не влияет на баланс пакета и календарь.
  final bool excludedFromBalance;
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
      excludedFromBalance: j['excludedFromBalance'] as bool? ?? false,
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

  /// Ключ кэша полной детали тренировки (для повтора из истории офлайн).
  String _detailCacheKey(String wid) => 'workout_detail_$wid';

  /// Загрузить деталь тренировки. Успех сети — кэшируем сырой объект под
  /// `workout_detail_<id>` (нужен для сборки плана повтора офлайн). Сетевая
  /// ошибка — отдаём из кэша, если он есть; иначе пробрасываем исходную ошибку
  /// (не сетевые ошибки — 404/500 — тоже пробрасываем как есть, без кэша).
  Future<Workout> fetch(String clientId, String wid) async {
    final KvStore store = _ref.read(kvStoreProvider);
    final String key = _detailCacheKey(wid);
    try {
      final Map<String, dynamic> r = await _api.getJson(_base(clientId, wid));
      final Map<String, dynamic> raw = (r['workout'] as Map<String, dynamic>?) ?? <String, dynamic>{};
      await store.writeList(key, <Map<String, dynamic>>[raw]);
      return _unwrap(r);
    } catch (e) {
      if (!isOfflineError(e)) rethrow;
      final List<Map<String, dynamic>>? cached = await store.readList(key);
      if (cached == null || cached.isEmpty) rethrow;
      return _unwrap(<String, dynamic>{'workout': cached.first});
    }
  }

  /// Удалить тренировку (отменить назначенную/черновик). Если удаляемая —
  /// та, на которую указывает «Вернуться к тренировке», сбрасываем указатель.
  Future<void> delete(String clientId, String wid) async {
    await _api.deleteJson(_base(clientId, wid));
    final ({String clientId, String workoutId, String name, bool local})? ptr =
        await ActiveWorkoutPointer.read();
    if (ptr?.workoutId == wid) await ActiveWorkoutPointer.clear();
  }

  /// Старт тренировки → статус active. Запоминаем указатель активной тренировки
  /// для блока «Вернуться к тренировке» на главной.
  Future<Workout> start(String clientId, String wid) async {
    final Map<String, dynamic> r = await _api.postJson('${_base(clientId, wid)}/start');
    final Workout w = await _unwrap(r);
    await ActiveWorkoutPointer.save(clientId: clientId, workoutId: wid, name: w.name);
    return w;
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

  /// Добавить один подход к упражнению на позиции pos (копия плановых параметров
  /// шаблона — используется для «+1» без удержания).
  Future<Workout> addSet(String clientId, String wid, int pos, WorkoutSet template) async {
    // Копируем ТЕКУЩИЕ значения подхода (факт, если отредактирован, иначе план) —
    // иначе «+1» после правки атрибутов копировал старый план. Отдых — плановый.
    final num? reps = template.actualReps ?? template.plannedReps;
    final num? weight = template.actualWeightKg ?? template.plannedWeightKg;
    final num? time = template.actualTimeSec ?? template.plannedTimeSec;
    final num? rest = template.plannedRestSec;
    final Map<String, dynamic> r = await _api.postJson(
      '${_base(clientId, wid)}/exercises/$pos/sets',
      <String, dynamic>{
        'plannedReps': ?reps,
        'plannedWeightKg': ?weight,
        'plannedTimeSec': ?time,
        'plannedRestSec': ?rest,
      },
    );
    return _unwrap(r);
  }

  /// Удалить подход (pos, idx). Последний подход упражнения удаляет и само упражнение.
  Future<Workout> deleteSet(String clientId, String wid, int pos, int idx) async {
    final Map<String, dynamic> r =
        await _api.deleteJson('${_base(clientId, wid)}/exercises/$pos/sets/$idx');
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
      <String, dynamic>{
        'durationSec': ?durationSec,
        'rpe': null,
        'trainerNote': null,
        // Смещение таймзоны устройства — сервер проставит локальное время
        // авто-созданного занятия (иначе оно шло бы по UTC).
        'tzOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
      },
    );
    await ActiveWorkoutPointer.clear();
    return _unwrap(r);
  }

  /// Зафиксировать тренировку в истории клиента указанной датой (постфактум).
  /// [date] — ISO YYYY-MM-DD. Бэкенд помечает запись завершённой этой датой.
  Future<Workout> addToHistory(String clientId, String wid, String date) async {
    final Map<String, dynamic> r = await _api.postJson(
      '${_base(clientId, wid)}/add-to-history',
      <String, dynamic>{'date': date},
    );
    return _unwrap(r);
  }

  /// Импорт целиком офлайн-проведённой тренировки (идемпотентно по
  /// doc['idempotencyKey']). Тело — importWorkoutRequest (см. @trener/shared).
  Future<void> importWorkout(String clientId, Map<String, dynamic> doc) async {
    await _api.postJson('/api/clients/$clientId/workouts/import', doc);
  }
}

final Provider<TrainerWorkoutsApi> trainerWorkoutsApiProvider =
    Provider<TrainerWorkoutsApi>((ref) => TrainerWorkoutsApi(ref));

/// Полная тренировка по (clientId, wid) — для экрана проведения.
final FutureProviderFamily<Workout, ({String clientId, String wid})> trainerWorkoutProvider =
    FutureProvider.family<Workout, ({String clientId, String wid})>(
        (ref, ({String clientId, String wid}) k) =>
            ref.read(trainerWorkoutsApiProvider).fetch(k.clientId, k.wid));
