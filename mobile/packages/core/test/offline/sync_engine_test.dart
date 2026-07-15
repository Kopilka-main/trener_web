import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeStore implements KvStore {
  final Map<String, List<Map<String, dynamic>>> _d = {};
  @override
  Future<List<Map<String, dynamic>>?> readList(String k) async => _d[k];
  @override
  Future<void> writeList(String k, List<Map<String, dynamic>> v) async => _d[k] = v;
}

void main() {
  late Outbox outbox;
  setUp(() {
    int t = 0;
    outbox = Outbox(_FakeStore(), clock: () => t++);
  });

  test('сливает по порядку и удаляет отправленные', () async {
    await outbox.enqueue(kind: 'k', payload: {'n': 1});
    await outbox.enqueue(kind: 'k', payload: {'n': 2});
    final seen = <int>[];
    final engine = SyncEngine(outbox, handlers: {
      'k': (item) async => seen.add(item.payload['n'] as int),
    });
    final res = await engine.drain();
    expect(seen, [1, 2]);
    expect(res.sent, 2);
    expect(await outbox.list(), isEmpty);
  });

  test('отказ сервера → failed, но остальные продолжают', () async {
    await outbox.enqueue(kind: 'bad', payload: {});
    await outbox.enqueue(kind: 'ok', payload: {});
    var okDone = false;
    final engine = SyncEngine(outbox, handlers: {
      'bad': (_) async => throw Exception('422'),
      'ok': (_) async => okDone = true,
    });
    final res = await engine.drain();
    expect(okDone, true);
    expect(res.failed, 1);
    final left = await outbox.list();
    expect(left, hasLength(1));
    expect(left.first.status, OutboxStatus.failed);
  });

  test('OfflineException → прерывает слив, элемент остаётся pending', () async {
    await outbox.enqueue(kind: 'net', payload: {});
    await outbox.enqueue(kind: 'net', payload: {});
    var calls = 0;
    final engine = SyncEngine(outbox, handlers: {
      'net': (_) async {
        calls++;
        throw OfflineException();
      },
    });
    final res = await engine.drain();
    expect(calls, 1); // прервались после первого
    expect(res.stoppedOffline, true);
    final left = await outbox.list();
    expect(left, hasLength(2));
    expect(left.first.status, OutboxStatus.pending);
  });
}
