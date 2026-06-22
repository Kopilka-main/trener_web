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
    this.isGlobal = false,
    this.note,
    this.imageUrl,
    this.thumbUrl,
    this.videoUrl,
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
  final bool isGlobal;
  final String? note;
  final String? imageUrl;
  final String? thumbUrl;
  final String? videoUrl;

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
        isGlobal: j['isGlobal'] as bool? ?? false,
        note: j['note'] as String?,
        imageUrl: j['imageUrl'] as String?,
        thumbUrl: j['thumbUrl'] as String?,
        videoUrl: j['videoUrl'] as String?,
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

  /// Сырые JSON-объекты каталога (для офлайн-кэша).
  Future<List<Map<String, dynamic>>> catalogRaw() async {
    final Map<String, dynamic> r = await _api.getJson('/api/exercises');
    return ((r['exercises'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>();
  }

  Future<List<TExercise>> catalog() async {
    return _sorted(await catalogRaw());
  }

  static List<TExercise> _sorted(List<Map<String, dynamic>> raw) {
    final List<TExercise> list = raw.map(TExercise.fromJson).toList();
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

  /// То же, но возвращает id созданного черновика (для привязки к занятию).
  /// [excludedFromBalance] — историческая запись (не влияет на баланс/календарь).
  Future<String> assignReturningId(
    String clientId,
    String name,
    List<Map<String, dynamic>> exercises, {
    bool excludedFromBalance = false,
  }) async {
    final Map<String, dynamic> r = await _api.postJson(
      '/api/clients/$clientId/workouts',
      <String, dynamic>{
        'name': name,
        'exercises': exercises,
        if (excludedFromBalance) 'excludedFromBalance': true,
      },
    );
    return (r['workout'] as Map<String, dynamic>?)?['id'] as String? ?? '';
  }
}

final Provider<TrainerAssignApi> trainerAssignApiProvider =
    Provider<TrainerAssignApi>((ref) => TrainerAssignApi(ref));

/// Каталог упражнений с офлайн-кэшем: мгновенно отдаёт сохранённую копию,
/// в фоне обновляет с сервера и прогревает превью. Без сети — работает на кэше.
class TrainerCatalogNotifier extends AsyncNotifier<List<TExercise>> {
  static const String _key = 'trainer_exercises';

  @override
  Future<List<TExercise>> build() async {
    final List<Map<String, dynamic>>? cached = await LocalJsonStore.instance.readList(_key);
    if (cached != null && cached.isNotEmpty) {
      // фоновое обновление, не блокируя выдачу кэша
      Future<void>(() => _refresh());
      return TrainerAssignApi._sorted(cached);
    }
    return _fetch();
  }

  Future<List<TExercise>> _fetch() async {
    final List<Map<String, dynamic>> raw = await ref.read(trainerAssignApiProvider).catalogRaw();
    await LocalJsonStore.instance.writeList(_key, raw);
    final List<TExercise> list = TrainerAssignApi._sorted(raw);
    _warm(list);
    return list;
  }

  Future<void> _refresh() async {
    try {
      final List<TExercise> list = await _fetch();
      state = AsyncData<List<TExercise>>(list);
    } catch (_) {
      // офлайн — остаёмся на кэше
    }
  }

  void _warm(List<TExercise> list) {
    final String base = ref.read(baseUrlProvider);
    final List<String> thumbs = <String>[
      for (final TExercise e in list)
        if (catalogMediaUrl(base, e.thumbUrl ?? e.imageUrl) case final String u) u,
    ];
    Future<void>(() => prefetchThumbs(thumbs));
  }
}

final AsyncNotifierProvider<TrainerCatalogNotifier, List<TExercise>> trainerCatalogProvider =
    AsyncNotifierProvider<TrainerCatalogNotifier, List<TExercise>>(TrainerCatalogNotifier.new);
