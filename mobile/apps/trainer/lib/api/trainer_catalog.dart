import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

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

  Future<List<Map<String, dynamic>>> _rawCache() async =>
      (await store.readList(cacheKey)) ?? <Map<String, dynamic>>[];

  /// Пишет [raw] в кэш и синхронно обновляет state — один путь для онлайн и
  /// офлайн мутаций (оптимистичное обновление).
  Future<void> _applyRaw(List<Map<String, dynamic>> raw) async {
    await store.writeList(cacheKey, raw);
    state = AsyncData<List<WorkoutTemplate>>(parse(raw));
  }

  /// Дописывает `exerciseName` в raw-позициях шаблона по каталогу упражнений
  /// (сервер их в теле запроса не присылает — нужны только для оптимистичной
  /// карточки, которую строим на клиенте).
  List<Map<String, dynamic>> _withExerciseNames(dynamic exercisesIn) {
    final List<TExercise> catalog = ref.read(trainerCatalogProvider).valueOrNull ?? <TExercise>[];
    final Map<String, String> namesById = <String, String>{
      for (final TExercise e in catalog) e.id: e.name,
    };
    return ((exercisesIn as List<dynamic>?) ?? <dynamic>[]).map((dynamic e) {
      final Map<String, dynamic> m = (e as Map).cast<String, dynamic>();
      return <String, dynamic>{
        ...m,
        'exerciseName': namesById[m['exerciseId']] ?? 'Упражнение',
      };
    }).toList();
  }

  /// Онлайн-слив забрал элемент [outboxItemId] (сервер подтвердил) → сверяем
  /// оптимистичную карточку с сервером. Если элемент остался в очереди (нет
  /// связи или сервер отверг) — рефетч не делаем, карточка живёт в кэше до связи.
  Future<void> _invalidateIfSent(String outboxItemId) async {
    final List<OutboxItem> remaining = await ref.read(outboxProvider).list();
    final bool stillQueued = remaining.any((OutboxItem i) => i.id == outboxItemId);
    if (!stillQueued) ref.invalidateSelf();
  }

  /// Первый ещё не отправленный `template.create` этого локального шаблона
  /// ([clientLocalId] == [localId]) в очереди — или null. Корреляция нужна,
  /// т.к. клиентский uuid карточки ≠ серверный id (сервер присвоит свой при
  /// сливе), и правку/удаление до синка нельзя слать как отдельный
  /// update/delete по клиентскому id.
  Future<OutboxItem?> _pendingCreateFor(String localId) => ref
      .read(outboxProvider)
      .firstPending((OutboxItem i) =>
          i.kind == 'template.create' && i.payload['clientLocalId'] == localId);

  /// Создать шаблон офлайн-безопасно: оптимистичная карточка (клиентский uuid,
  /// имена упражнений из каталога) сразу в state+кэш, элемент очереди
  /// 'template.create'. [clientId] задан → персональный шаблон.
  Future<void> createOffline(Map<String, dynamic> body, {String? clientId}) async {
    final String localId = const Uuid().v4();
    final Map<String, dynamic> raw = <String, dynamic>{
      'id': localId,
      'name': body['name'],
      'categoryTag': body['categoryTag'],
      'shortDescription': body['shortDescription'],
      'exercises': _withExerciseNames(body['exercises']),
      'clientId': ?clientId,
    };
    final List<Map<String, dynamic>> list = await _rawCache();
    list.insert(0, raw);
    await _applyRaw(list);

    final Map<String, dynamic> queueBody = <String, dynamic>{
      ...body,
      'clientId': ?clientId,
    };
    // clientLocalId — корреляционный ключ карточки для коалесинга (на сервер НЕ
    // уходит: обработчик шлёт только payload['body']).
    final OutboxItem item = await ref.read(outboxProvider).enqueue(
          kind: 'template.create',
          payload: <String, dynamic>{'clientLocalId': localId, 'body': queueBody},
        );
    await drainOnline(ref);
    await _invalidateIfSent(item.id);
  }

  /// Изменить шаблон офлайн-безопасно: оптимистично заменяет запись в кэше.
  /// Если шаблон ещё не синкан (в очереди висит его `template.create`) —
  /// перезаписываем тело этого create (коалесинг), иначе ставим `template.update`.
  Future<void> updateOffline(String id, Map<String, dynamic> body) async {
    final List<Map<String, dynamic>> list = await _rawCache();
    final int i = list.indexWhere((Map<String, dynamic> e) => e['id'] == id);
    if (i != -1) {
      final Map<String, dynamic> merged = <String, dynamic>{...list[i], ...body};
      if (body.containsKey('exercises')) {
        merged['exercises'] = _withExerciseNames(body['exercises']);
      }
      list[i] = merged;
    }
    await _applyRaw(list);

    final OutboxItem? pendingCreate = await _pendingCreateFor(id);
    if (pendingCreate != null) {
      // Правка не синканного шаблона: обновляем тело create вместо отдельного
      // update (иначе update ушёл бы по клиентскому id → 404 → правка теряется).
      // Сохраняем clientId из тела create (scope не меняется при правке).
      final Map<String, dynamic> createBody =
          (pendingCreate.payload['body'] as Map).cast<String, dynamic>();
      final Map<String, dynamic> newBody = <String, dynamic>{
        ...body,
        'clientId': ?createBody['clientId'],
      };
      await ref.read(outboxProvider).patchPayload(
            pendingCreate.id,
            <String, dynamic>{'clientLocalId': id, 'body': newBody},
          );
      await drainOnline(ref);
      await _invalidateIfSent(pendingCreate.id);
      return;
    }

    final OutboxItem item = await ref.read(outboxProvider).enqueue(
          kind: 'template.update',
          payload: <String, dynamic>{'id': id, 'body': body},
        );
    await drainOnline(ref);
    await _invalidateIfSent(item.id);
  }

  /// Удалить шаблон офлайн-безопасно: оптимистично убирает запись из кэша. Если
  /// шаблон ещё не синкан (в очереди висит его `template.create`) — просто
  /// удаляем этот create (на сервере шаблона ещё нет), иначе ставим
  /// `template.delete`.
  Future<void> deleteOffline(String id) async {
    final List<Map<String, dynamic>> list = await _rawCache()
      ..removeWhere((Map<String, dynamic> e) => e['id'] == id);
    await _applyRaw(list);

    final OutboxItem? pendingCreate = await _pendingCreateFor(id);
    if (pendingCreate != null) {
      await ref.read(outboxProvider).remove(pendingCreate.id);
      await drainOnline(ref); // обновить индикатор очереди
      return;
    }

    final OutboxItem item = await ref.read(outboxProvider).enqueue(
          kind: 'template.delete',
          payload: <String, dynamic>{'id': id},
        );
    await drainOnline(ref);
    await _invalidateIfSent(item.id);
  }
}

final AsyncNotifierProvider<TrainerTemplatesNotifier, List<WorkoutTemplate>> trainerTemplatesProvider =
    AsyncNotifierProvider<TrainerTemplatesNotifier, List<WorkoutTemplate>>(TrainerTemplatesNotifier.new);

/// Обработчик 'template.create': шлёт создание шаблона на сервер (переиспользуем
/// [TrainerCatalogApi.createTemplate] как sender). Клиентский (оптимистичный) id
/// карточки не передаётся — сервер присвоит свой; после успешного слива
/// нотифайер делает invalidateSelf (рефетч заменит карточку серверной).
SyncHandler makeTemplateCreateHandler(TrainerCatalogApi api) {
  return (OutboxItem item) async {
    final Map<String, dynamic> body = (item.payload['body'] as Map).cast<String, dynamic>();
    await api.createTemplate(body);
  };
}

/// Обработчик 'template.update': PATCH идемпотентен на сервере; 404 (шаблон уже
/// удалён либо create ещё не дошёл) — считаем успехом (глотаем).
SyncHandler makeTemplateUpdateHandler(TrainerCatalogApi api) {
  return (OutboxItem item) async {
    final String id = item.payload['id'] as String;
    final Map<String, dynamic> body = (item.payload['body'] as Map).cast<String, dynamic>();
    try {
      await api.updateTemplate(id, body);
    } catch (e) {
      if (isOfflineError(e) || apiErrorStatus(e) != 404) rethrow;
    }
  };
}

/// Обработчик 'template.delete': 404 — шаблон уже удалён, считаем успехом.
SyncHandler makeTemplateDeleteHandler(TrainerCatalogApi api) {
  return (OutboxItem item) async {
    final String id = item.payload['id'] as String;
    try {
      await api.deleteTemplate(id);
    } catch (e) {
      if (isOfflineError(e) || apiErrorStatus(e) != 404) rethrow;
    }
  };
}
