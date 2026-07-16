import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trener_trainer/api/offline_providers.dart';

class _FakeStore implements KvStore {
  final Map<String, List<Map<String, dynamic>>> _d = {};
  @override
  Future<List<Map<String, dynamic>>?> readList(String k) async => _d[k];
  @override
  Future<void> writeList(String k, List<Map<String, dynamic>> v) async => _d[k] = v;
}

void main() {
  // Индикатор синка («N ждут отправки») читает syncStatusProvider — не должен
  // вечно показывать dead-letter элементы, которые слив больше не тронет.
  test('syncStatusProvider не считает dead-letter элементы (индикатор не виснет)', () async {
    final store = _FakeStore();
    final container = ProviderContainer(overrides: [
      kvStoreProvider.overrideWithValue(store),
      // maxAttempts=2 для короткого теста; handlers пуст → любой kind падает
      // как "Неизвестный тип" (markFailed), что нам и нужно для dead-letter.
      syncEngineProvider.overrideWith(
        (ref) => SyncEngine(ref.read(outboxProvider), handlers: const {}, maxAttempts: 2),
      ),
    ]);
    addTearDown(container.dispose);

    final outbox = container.read(outboxProvider);
    await outbox.enqueue(kind: 'unknown', payload: {});
    final engine = container.read(syncEngineProvider);
    await engine.drain(); // attempts=1, failed
    await engine.drain(); // attempts=2 == maxAttempts → dead-letter

    // Живой (ещё не тронутый сливом) элемент рядом с dead-letter.
    await outbox.enqueue(kind: 'unknown', payload: {});

    expect(await outbox.list(), hasLength(2));
    expect(await container.read(syncStatusProvider.future), 1);
  });
}
