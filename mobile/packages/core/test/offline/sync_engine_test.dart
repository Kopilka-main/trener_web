import 'dart:async';

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

  test('отравленный элемент (постоянный отказ сервера) перестаёт вызываться после maxAttempts', () async {
    await outbox.enqueue(kind: 'bad', payload: {});
    var calls = 0;
    final engine = SyncEngine(
      outbox,
      handlers: {
        'bad': (_) async {
          calls++;
          throw Exception('400');
        },
      },
      maxAttempts: 3,
    );
    // 3 прогона drain() исчерпывают лимит попыток — обработчик вызывается 3 раза.
    await engine.drain();
    await engine.drain();
    await engine.drain();
    expect(calls, 3);
    final afterLimit = await outbox.list();
    expect(afterLimit.single.attempts, 3);
    // Дальнейшие drain() не трогают dead-letter элемент.
    await engine.drain();
    await engine.drain();
    expect(calls, 3);
    final still = await outbox.list();
    expect(still.single.status, OutboxStatus.failed);
    expect(still.single.attempts, 3);
  });

  test('элемент, застрявший в sending (эмуляция убитого процесса), переигрывается при drain()', () async {
    final a = await outbox.enqueue(kind: 'k', payload: {'n': 1});
    // Эмулируем прерванный слив: markSending записан на диск, но "процесс"
    // (этот SyncEngine) больше никогда не вызовет handler — как при
    // kill/crash между markSending и ответом сервера.
    await outbox.markSending(a.id);
    var calls = 0;
    final engine = SyncEngine(outbox, handlers: {
      'k': (_) async => calls++,
    });
    final res = await engine.drain();
    expect(calls, 1);
    expect(res.sent, 1);
    expect(await outbox.list(), isEmpty);
  });

  test('параллельные drain() не отправляют один элемент дважды (реентрант-гвард)', () async {
    await outbox.enqueue(kind: 'k', payload: {});
    var calls = 0;
    final gate = Completer<void>();
    final engine = SyncEngine(outbox, handlers: {
      'k': (_) async {
        calls++;
        await gate.future; // держим первый слив в полёте, пока стартует второй
      },
    });
    // Оба стартуют, пока элемент ещё в очереди: без гварда второй тоже отправит.
    final f1 = engine.drain();
    final f2 = engine.drain();
    gate.complete();
    await Future.wait<SyncResult>([f1, f2]);
    expect(calls, 1);
    expect(await outbox.list(), isEmpty);
  });

  test('элемент, добавленный во время слива, отправляется повторным прогоном', () async {
    var calls = 0;
    final gate = Completer<void>();
    late final SyncEngine engine;
    engine = SyncEngine(outbox, handlers: {
      'first': (_) async {
        calls++;
        // Пока первый в полёте — кладём второй элемент и стартуем параллельный
        // drain (взведёт _rerun), который должен подхватиться после завершения.
        await outbox.enqueue(kind: 'second', payload: {});
        unawaited(engine.drain());
        await gate.future;
      },
      'second': (_) async => calls++,
    });
    await outbox.enqueue(kind: 'first', payload: {});
    final f1 = engine.drain();
    gate.complete();
    await f1;
    // Дать повторному прогону завершиться.
    await Future<void>.delayed(Duration.zero);
    expect(calls, 2);
    expect(await outbox.list(), isEmpty);
  });
}
