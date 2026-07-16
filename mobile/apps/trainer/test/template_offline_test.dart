import 'package:core/core.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trener_trainer/api/offline_providers.dart';
import 'package:trener_trainer/api/trainer_assign.dart';
import 'package:trener_trainer/api/trainer_catalog.dart';

class _FakeStore implements KvStore {
  final Map<String, List<Map<String, dynamic>>> _d = {};
  @override
  Future<List<Map<String, dynamic>>?> readList(String k) async => _d[k];
  @override
  Future<void> writeList(String k, List<Map<String, dynamic>> v) async => _d[k] = v;
}

/// Каталог упражнений-заглушка (без сети/платформенных каналов) — только для
/// резолва exerciseName в оптимистичных карточках шаблонов.
class _FakeExerciseCatalog extends TrainerCatalogNotifier {
  @override
  Future<List<TExercise>> build() async => <TExercise>[
        TExercise(
          id: 'ex1',
          name: 'Жим лёжа',
          category: 'Грудь',
          subgroup: null,
          defaultReps: 10,
          defaultWeightKg: null,
          defaultTimeSec: null,
          restSec: 90,
        ),
      ];
}

/// Заглушка отправителя шаблонов: по умолчанию сервер недоступен (бросает —
/// элемент остаётся в очереди), [succeed] переключает на «сервер принял».
class _FakeTemplateApi extends TrainerCatalogApi {
  _FakeTemplateApi(super.ref);
  bool succeed = false;
  final List<Map<String, dynamic>> created = <Map<String, dynamic>>[];
  final List<String> deleted = <String>[];

  @override
  Future<List<Map<String, dynamic>>> templatesRaw() async => <Map<String, dynamic>>[];

  @override
  Future<void> createTemplate(Map<String, dynamic> body, {String? clientId}) async {
    if (!succeed) throw Exception('нет связи (тест)');
    created.add(body);
  }

  @override
  Future<void> updateTemplate(String id, Map<String, dynamic> body) async {
    if (!succeed) throw Exception('нет связи (тест)');
  }

  @override
  Future<void> deleteTemplate(String id) async {
    if (!succeed) throw Exception('нет связи (тест)');
    deleted.add(id);
  }
}

/// API-заглушка для тестов ОБРАБОТЧИКОВ очереди: sender шаблонов бросает
/// заранее заданный [DioException] (сеть/404/отказ). Так проверяем реальную
/// ветвистость make*Handler через настоящий SyncEngine.
class _ThrowingTemplateApi extends TrainerCatalogApi {
  _ThrowingTemplateApi(super.ref, {this.toThrow});
  final DioException? toThrow;
  int createCalls = 0;
  int updateCalls = 0;
  int deleteCalls = 0;

  @override
  Future<List<Map<String, dynamic>>> templatesRaw() async => <Map<String, dynamic>>[];

  @override
  Future<void> createTemplate(Map<String, dynamic> body, {String? clientId}) async {
    createCalls++;
    if (toThrow != null) throw toThrow!;
  }

  @override
  Future<void> updateTemplate(String id, Map<String, dynamic> body) async {
    updateCalls++;
    if (toThrow != null) throw toThrow!;
  }

  @override
  Future<void> deleteTemplate(String id) async {
    deleteCalls++;
    if (toThrow != null) throw toThrow!;
  }
}

/// DioException как в core/test/offline/offline_error_test.dart — с типом
/// (сетевые типы → isOfflineError true) и опциональным HTTP-статусом (для 404).
DioException _dio(DioExceptionType type, {int? statusCode}) => DioException(
      requestOptions: RequestOptions(path: '/x'),
      type: type,
      response: statusCode == null
          ? null
          : Response<dynamic>(requestOptions: RequestOptions(path: '/x'), statusCode: statusCode),
    );

void main() {
  late _FakeStore store;
  late ProviderContainer container;

  setUp(() async {
    store = _FakeStore();
    container = ProviderContainer(overrides: <Override>[
      kvStoreProvider.overrideWithValue(store),
      trainerCatalogProvider.overrideWith(_FakeExerciseCatalog.new),
      trainerCatalogApiProvider.overrideWith((Ref ref) => _FakeTemplateApi(ref)),
    ]);
    addTearDown(container.dispose);
    // Дожидаемся первого build() обоих провайдеров, прежде чем мутировать state.
    await container.read(trainerTemplatesProvider.future);
    await container.read(trainerCatalogProvider.future);
  });

  test('createOffline кладёт оптимистичную карточку в state+кэш и элемент в очередь', () async {
    await container.read(trainerTemplatesProvider.notifier).createOffline(<String, dynamic>{
      'name': 'Верх тела',
      'categoryTag': null,
      'shortDescription': null,
      'exercises': <Map<String, dynamic>>[
        <String, dynamic>{
          'exerciseId': 'ex1',
          'sets': 3,
          'reps': 10,
          'weightKg': null,
          'timeSec': null,
          'restSec': 90,
        },
      ],
    });

    final List<WorkoutTemplate> state =
        container.read(trainerTemplatesProvider).valueOrNull ?? <WorkoutTemplate>[];
    expect(state.any((WorkoutTemplate t) => t.name == 'Верх тела'), true);

    final List<Map<String, dynamic>> cached =
        await store.readList('trainer_templates') ?? <Map<String, dynamic>>[];
    expect(cached.any((Map<String, dynamic> e) => e['name'] == 'Верх тела'), true);

    final List<Map<String, dynamic>> queue = await store.readList('outbox') ?? <Map<String, dynamic>>[];
    expect(queue, hasLength(1));
    expect(queue.first['kind'], 'template.create');
  });

  test('deleteOffline убирает карточку из кэша и ставит template.delete в очередь', () async {
    await container.read(trainerTemplatesProvider.notifier).createOffline(<String, dynamic>{
      'name': 'Ноги',
      'categoryTag': null,
      'shortDescription': null,
      'exercises': <Map<String, dynamic>>[],
    });
    final List<WorkoutTemplate> before =
        container.read(trainerTemplatesProvider).valueOrNull ?? <WorkoutTemplate>[];
    final String id = before.firstWhere((WorkoutTemplate t) => t.name == 'Ноги').id;

    await container.read(trainerTemplatesProvider.notifier).deleteOffline(id);

    final List<WorkoutTemplate> after =
        container.read(trainerTemplatesProvider).valueOrNull ?? <WorkoutTemplate>[];
    expect(after.any((WorkoutTemplate t) => t.id == id), false);

    final List<Map<String, dynamic>> cached =
        await store.readList('trainer_templates') ?? <Map<String, dynamic>>[];
    expect(cached.any((Map<String, dynamic> e) => e['id'] == id), false);

    final List<Map<String, dynamic>> queue = await store.readList('outbox') ?? <Map<String, dynamic>>[];
    expect(
      queue.map((Map<String, dynamic> e) => e['kind']),
      containsAll(<String>['template.create', 'template.delete']),
    );
  });

  test('updateOffline оптимистично заменяет запись в кэше и ставит template.update', () async {
    await container.read(trainerTemplatesProvider.notifier).createOffline(<String, dynamic>{
      'name': 'Спина',
      'categoryTag': null,
      'shortDescription': null,
      'exercises': <Map<String, dynamic>>[],
    });
    final String id = (container.read(trainerTemplatesProvider).valueOrNull ?? <WorkoutTemplate>[])
        .firstWhere((WorkoutTemplate t) => t.name == 'Спина')
        .id;

    await container.read(trainerTemplatesProvider.notifier).updateOffline(id, <String, dynamic>{
      'name': 'Спина + бицепс',
      'exercises': <Map<String, dynamic>>[
        <String, dynamic>{'exerciseId': 'ex1', 'sets': 3, 'reps': 10, 'restSec': 90},
      ],
    });

    // Оптимистичная замена в state: id тот же, поля обновлены.
    final WorkoutTemplate updated = (container.read(trainerTemplatesProvider).valueOrNull ?? <WorkoutTemplate>[])
        .firstWhere((WorkoutTemplate t) => t.id == id);
    expect(updated.name, 'Спина + бицепс');
    expect(updated.exercises, hasLength(1));
    expect(updated.exercises.first.exerciseName, 'Жим лёжа'); // имя резолвится из каталога

    // И тот же id в кэше (замена, а не дубль).
    final List<Map<String, dynamic>> cached =
        await store.readList('trainer_templates') ?? <Map<String, dynamic>>[];
    expect(cached.where((Map<String, dynamic> e) => e['id'] == id), hasLength(1));
    expect(cached.firstWhere((Map<String, dynamic> e) => e['id'] == id)['name'], 'Спина + бицепс');

    final List<Map<String, dynamic>> queue = await store.readList('outbox') ?? <Map<String, dynamic>>[];
    expect(queue.map((Map<String, dynamic> e) => e['kind']), contains('template.update'));
  });

  // ─── Ветки обработчиков очереди через РЕАЛЬНЫЙ SyncEngine + Outbox ───
  group('обработчики очереди шаблонов (dio-ошибки, 404)', () {
    late Outbox outbox;
    setUp(() {
      int t = 0;
      outbox = Outbox(_FakeStore(), clock: () => t++);
    });

    SyncEngine engineFor(_ThrowingTemplateApi api) => SyncEngine(
          outbox,
          isOffline: isOfflineError,
          handlers: <String, SyncHandler>{
            'template.create': makeTemplateCreateHandler(api),
            'template.update': makeTemplateUpdateHandler(api),
            'template.delete': makeTemplateDeleteHandler(api),
          },
        );

    _ThrowingTemplateApi apiThrowing(DioException? e) {
      final ProviderContainer c = ProviderContainer();
      addTearDown(c.dispose);
      return _ThrowingTemplateApi(c.read(_refProbe), toThrow: e);
    }

    test('сетевой сбой → элемент остаётся pending, attempts не тратятся', () async {
      await outbox.enqueue(kind: 'template.create', payload: <String, dynamic>{'body': <String, dynamic>{}});
      final _ThrowingTemplateApi api = apiThrowing(_dio(DioExceptionType.connectionError));
      final SyncResult res = await engineFor(api).drain();

      expect(res.stoppedOffline, true);
      final List<OutboxItem> left = await outbox.list();
      expect(left, hasLength(1));
      expect(left.first.status, OutboxStatus.pending);
      expect(left.first.attempts, 0);
    });

    test('404 в update → обработчик проглатывает, элемент отправлен (markSent)', () async {
      await outbox.enqueue(
        kind: 'template.update',
        payload: <String, dynamic>{'id': 'x', 'body': <String, dynamic>{}},
      );
      final _ThrowingTemplateApi api = apiThrowing(_dio(DioExceptionType.badResponse, statusCode: 404));
      final SyncResult res = await engineFor(api).drain();

      expect(api.updateCalls, 1);
      expect(res.sent, 1);
      expect(await outbox.list(), isEmpty);
    });

    test('404 в delete → обработчик проглатывает, элемент отправлен (markSent)', () async {
      await outbox.enqueue(kind: 'template.delete', payload: <String, dynamic>{'id': 'x'});
      final _ThrowingTemplateApi api = apiThrowing(_dio(DioExceptionType.badResponse, statusCode: 404));
      final SyncResult res = await engineFor(api).drain();

      expect(api.deleteCalls, 1);
      expect(res.sent, 1);
      expect(await outbox.list(), isEmpty);
    });

    test('отказ сервера (400) → элемент failed', () async {
      await outbox.enqueue(
        kind: 'template.update',
        payload: <String, dynamic>{'id': 'x', 'body': <String, dynamic>{}},
      );
      final _ThrowingTemplateApi api = apiThrowing(_dio(DioExceptionType.badResponse, statusCode: 400));
      final SyncResult res = await engineFor(api).drain();

      expect(res.failed, 1);
      final List<OutboxItem> left = await outbox.list();
      expect(left, hasLength(1));
      expect(left.first.status, OutboxStatus.failed);
      expect(left.first.attempts, 1);
    });

    test('успех create → элемент отправлен (markSent), sender вызван один раз', () async {
      await outbox.enqueue(kind: 'template.create', payload: <String, dynamic>{'body': <String, dynamic>{}});
      final _ThrowingTemplateApi api = apiThrowing(null);
      final SyncResult res = await engineFor(api).drain();

      expect(api.createCalls, 1);
      expect(res.sent, 1);
      expect(await outbox.list(), isEmpty);
    });
  });
}

/// Минимальный Ref-провайдер: даёт валидный [Ref] для конструктора
/// [TrainerCatalogApi] (сам API в тестах обработчиков переопределён и Ref не
/// использует).
final Provider<Ref> _refProbe = Provider<Ref>((Ref ref) => ref);
