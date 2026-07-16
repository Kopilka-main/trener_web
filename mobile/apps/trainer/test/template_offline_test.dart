import 'package:core/core.dart';
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
}
