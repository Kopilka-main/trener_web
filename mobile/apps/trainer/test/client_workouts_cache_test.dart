import 'package:core/core.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trener_trainer/api/offline_providers.dart';
import 'package:trener_trainer/api/trainer_client_card.dart';

class _FakeStore implements KvStore {
  final Map<String, List<Map<String, dynamic>>> _d = {};
  @override
  Future<List<Map<String, dynamic>>?> readList(String k) async => _d[k];
  @override
  Future<void> writeList(String k, List<Map<String, dynamic>> v) async => _d[k] = v;
}

/// Заглушка ApiClient: getJson делегирует в подставное поведение теста, не
/// трогая реальный Dio/сеть.
class _FakeApiClient extends ApiClient {
  _FakeApiClient(this.onGetJson) : super(baseUrl: 'http://test', tokenProvider: () async => null);
  final Future<Map<String, dynamic>> Function(String path) onGetJson;

  @override
  Future<Map<String, dynamic>> getJson(String path) => onGetJson(path);
}

DioException _dio(DioExceptionType type, {int? statusCode}) => DioException(
      requestOptions: RequestOptions(path: '/x'),
      type: type,
      response: statusCode == null
          ? null
          : Response<dynamic>(requestOptions: RequestOptions(path: '/x'), statusCode: statusCode),
    );

Map<String, dynamic> _rawWorkout({String id = 'w1', String name = 'Верх тела'}) => <String, dynamic>{
      'id': id,
      'name': name,
      'status': 'completed',
      'exercises': <Map<String, dynamic>>[],
    };

void main() {
  late _FakeStore store;

  ProviderContainer buildContainer(_FakeApiClient api) {
    final ProviderContainer c = ProviderContainer(overrides: <Override>[
      kvStoreProvider.overrideWithValue(store),
      apiClientProvider.overrideWithValue(api),
    ]);
    addTearDown(c.dispose);
    return c;
  }

  setUp(() {
    store = _FakeStore();
  });

  test('успешный workouts() кэширует список под client_workouts_<id>', () async {
    final _FakeApiClient api = _FakeApiClient(
      (String path) async => <String, dynamic>{
        'workouts': <Map<String, dynamic>>[_rawWorkout()],
      },
    );
    final ProviderContainer c = buildContainer(api);

    final List<TWorkout> list = await c.read(trainerClientCardApiProvider).workouts('cl1');

    expect(list, hasLength(1));
    expect(list.first.name, 'Верх тела');

    final List<Map<String, dynamic>>? cached = await store.readList('client_workouts_cl1');
    expect(cached, isNotNull);
    expect(cached, hasLength(1));
    expect(cached!.first['id'], 'w1');
  });

  test('сетевая ошибка → workouts() отдаёт список из кэша', () async {
    await store.writeList('client_workouts_cl1', <Map<String, dynamic>>[_rawWorkout(name: 'Из кэша')]);
    final _FakeApiClient api = _FakeApiClient(
      (String path) async => throw _dio(DioExceptionType.connectionError),
    );
    final ProviderContainer c = buildContainer(api);

    final List<TWorkout> list = await c.read(trainerClientCardApiProvider).workouts('cl1');

    expect(list, hasLength(1));
    expect(list.first.name, 'Из кэша');
  });

  test('сетевая ошибка без кэша → пробрасывает исходную ошибку', () async {
    final _FakeApiClient api = _FakeApiClient(
      (String path) async => throw _dio(DioExceptionType.connectionTimeout),
    );
    final ProviderContainer c = buildContainer(api);

    expect(
      () => c.read(trainerClientCardApiProvider).workouts('cl1'),
      throwsA(isA<DioException>()),
    );
  });

  test('несетевая ошибка (404) → пробрасывает, кэш не подставляем', () async {
    await store.writeList('client_workouts_cl1', <Map<String, dynamic>>[_rawWorkout(name: 'Из кэша')]);
    final _FakeApiClient api = _FakeApiClient(
      (String path) async => throw _dio(DioExceptionType.badResponse, statusCode: 404),
    );
    final ProviderContainer c = buildContainer(api);

    expect(
      () => c.read(trainerClientCardApiProvider).workouts('cl1'),
      throwsA(isA<DioException>()),
    );
  });
}
