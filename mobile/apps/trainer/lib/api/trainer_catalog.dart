import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'offline_providers.dart';
import 'trainer_assign.dart';

/// Таксономия групп мышц и тегов шаблонов (зеркало apps/web/src/lib/muscleGroups.ts).
const List<String> kGroupOrder = <String>[
  'Грудь', 'Спина', 'Ноги', 'Плечи', 'Руки', 'Корпус', 'Пресс/Кор', 'Кардио', 'Растяжка', 'Йога',
];

const Map<String, List<String>> kSubgroupsByGroup = <String, List<String>>{
  'Грудь': <String>['Верх', 'Середина', 'Низ'],
  'Спина': <String>['Широчайшие', 'Трапеции/верх', 'Поясница/низ'],
  'Ноги': <String>['Квадрицепс', 'Бицепс бедра', 'Ягодицы', 'Икры'],
  'Плечи': <String>['Передняя дельта', 'Средняя дельта', 'Задняя дельта'],
  'Руки': <String>['Бицепс', 'Трицепс', 'Предплечья'],
  'Пресс/Кор': <String>['Верх', 'Низ', 'Косые'],
  'Корпус': <String>['Верх', 'Низ', 'Косые'],
};

List<String> subgroupsFor(String group) => kSubgroupsByGroup[group] ?? const <String>[];

const List<String> kTemplateTags = <String>[
  'Сила', 'Гипертрофия', 'Push', 'Pull', 'Восстановительная', 'Кардио', 'Кроссфит', 'Йога', 'Реабилитация',
];

/// Позиция упражнения в шаблоне.
class TemplateExercise {
  TemplateExercise({
    required this.exerciseId,
    required this.exerciseName,
    required this.sets,
    required this.reps,
    required this.weightKg,
    required this.timeSec,
    required this.restSec,
  });
  final String exerciseId;
  final String exerciseName;
  /// Число подходов (count). В шаблоне «3 подхода» хранится как sets=3 на одной
  /// записи — при назначении разворачиваем в N подходов.
  final int sets;
  final num? reps;
  final num? weightKg;
  final num? timeSec;
  final num? restSec;

  factory TemplateExercise.fromJson(Map<String, dynamic> j) => TemplateExercise(
        exerciseId: j['exerciseId'] as String? ?? '',
        exerciseName: j['exerciseName'] as String? ?? 'Упражнение',
        sets: ((j['sets'] as num?)?.toInt() ?? 1).clamp(1, 99),
        reps: j['reps'] as num?,
        weightKg: j['weightKg'] as num?,
        timeSec: j['timeSec'] as num?,
        restSec: j['restSec'] as num?,
      );

  Map<String, dynamic> toPayload() => <String, dynamic>{
        'exerciseId': exerciseId,
        'sets': sets,
        'reps': reps,
        'weightKg': weightKg,
        'timeSec': timeSec,
        'restSec': restSec ?? 90,
      };
}

/// Шаблон тренировки.
class WorkoutTemplate {
  WorkoutTemplate({
    required this.id,
    required this.name,
    required this.categoryTag,
    required this.shortDescription,
    required this.exercises,
    this.clientId,
    this.clientName,
  });
  final String id;
  final String name;
  final String? categoryTag;
  final String? shortDescription;
  final List<TemplateExercise> exercises;

  /// Персональный шаблон привязан к клиенту (`clientId != null`, `clientName` —
  /// его имя). Общий шаблон — оба null.
  final String? clientId;
  final String? clientName;

  bool get isPersonal => clientId != null;

  factory WorkoutTemplate.fromJson(Map<String, dynamic> j) => WorkoutTemplate(
        id: j['id'] as String? ?? '',
        name: j['name'] as String? ?? 'Шаблон',
        categoryTag: j['categoryTag'] as String?,
        shortDescription: j['shortDescription'] as String?,
        exercises: ((j['exercises'] as List<dynamic>?) ?? <dynamic>[])
            .cast<Map<String, dynamic>>()
            .map(TemplateExercise.fromJson)
            .toList(),
        clientId: j['clientId'] as String?,
        clientName: j['clientName'] as String?,
      );
}

class TrainerCatalogApi {
  TrainerCatalogApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  // ─── Упражнения ───
  Future<TExercise> createExercise(Map<String, dynamic> body) async {
    final Map<String, dynamic> r = await _api.postJson('/api/exercises', body);
    return TExercise.fromJson((r['exercise'] as Map<String, dynamic>?) ?? <String, dynamic>{});
  }

  Future<TExercise> updateExercise(String id, Map<String, dynamic> body) async {
    final Map<String, dynamic> r = await _api.patchJson('/api/exercises/$id', body);
    return TExercise.fromJson((r['exercise'] as Map<String, dynamic>?) ?? <String, dynamic>{});
  }

  Future<void> deleteExercise(String id) async {
    await _api.deleteJson('/api/exercises/$id');
  }

  // ─── Шаблоны ───
  Future<List<WorkoutTemplate>> templates() async {
    final List<Map<String, dynamic>> raw = await templatesRaw();
    final List<WorkoutTemplate> list = raw.map(WorkoutTemplate.fromJson).toList();
    list.sort((WorkoutTemplate a, WorkoutTemplate b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return list;
  }

  /// Сырые записи шаблонов (для кэша cache-first, см. [TrainerTemplatesNotifier]).
  Future<List<Map<String, dynamic>>> templatesRaw() async {
    final Map<String, dynamic> r = await _api.getJson('/api/workout-templates');
    return ((r['templates'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>();
  }

  /// [clientId] задан → персональный шаблон для этого клиента; иначе общий.
  Future<void> createTemplate(Map<String, dynamic> body, {String? clientId}) async {
    await _api.postJson('/api/workout-templates', <String, dynamic>{
      ...body,
      'clientId': ?clientId,
    });
  }

  Future<void> updateTemplate(String id, Map<String, dynamic> body) async {
    await _api.patchJson('/api/workout-templates/$id', body);
  }

  Future<void> deleteTemplate(String id) async {
    await _api.deleteJson('/api/workout-templates/$id');
  }
}

final Provider<TrainerCatalogApi> trainerCatalogApiProvider =
    Provider<TrainerCatalogApi>((ref) => TrainerCatalogApi(ref));

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
    final List<WorkoutTemplate> list = raw.map(WorkoutTemplate.fromJson).toList();
    list.sort((WorkoutTemplate a, WorkoutTemplate b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return list;
  }
}

final AsyncNotifierProvider<TrainerTemplatesNotifier, List<WorkoutTemplate>> trainerTemplatesProvider =
    AsyncNotifierProvider<TrainerTemplatesNotifier, List<WorkoutTemplate>>(TrainerTemplatesNotifier.new);
