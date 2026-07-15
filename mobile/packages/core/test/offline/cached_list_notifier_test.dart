import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeStore implements KvStore {
  _FakeStore([Map<String, List<Map<String, dynamic>>>? seed]) : _d = seed ?? {};
  final Map<String, List<Map<String, dynamic>>> _d;
  @override
  Future<List<Map<String, dynamic>>?> readList(String k) async => _d[k];
  @override
  Future<void> writeList(String k, List<Map<String, dynamic>> v) async => _d[k] = v;
}

class _TestNotifier extends CachedListNotifier<int> {
  _TestNotifier(this._store, this._fetch);
  final KvStore _store;
  final Future<List<Map<String, dynamic>>> Function() _fetch;
  @override
  String get cacheKey => 'nums';
  @override
  KvStore get store => _store;
  @override
  Future<List<Map<String, dynamic>>> fetchRaw() => _fetch();
  @override
  List<int> parse(List<Map<String, dynamic>> raw) =>
      raw.map((m) => m['v'] as int).toList();
}

void main() {
  test('без кэша — грузит с сервера и пишет в кэш', () async {
    final store = _FakeStore();
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final p = AsyncNotifierProvider<_TestNotifier, List<int>>(
      () => _TestNotifier(store, () async => [
            {'v': 1},
            {'v': 2},
          ]));
    expect(await c.read(p.future), [1, 2]);
    expect(await store.readList('nums'), isNotEmpty);
  });

  test('с кэшем — отдаёт кэш сразу (даже если fetch падает офлайн)', () async {
    final store = _FakeStore({
      'nums': [
        {'v': 7},
      ],
    });
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final p = AsyncNotifierProvider<_TestNotifier, List<int>>(
      () => _TestNotifier(store, () async => throw Exception('offline')));
    expect(await c.read(p.future), [7]);
  });
}
