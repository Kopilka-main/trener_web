import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeStore implements KvStore {
  final Map<String, List<Map<String, dynamic>>> _data = {};
  @override
  Future<List<Map<String, dynamic>>?> readList(String key) async => _data[key];
  @override
  Future<void> writeList(String key, List<Map<String, dynamic>> value) async =>
      _data[key] = value;
}

void main() {
  late _FakeStore store;
  late Outbox outbox;
  int t = 1000;
  setUp(() {
    store = _FakeStore();
    outbox = Outbox(store, clock: () => t++);
  });

  test('enqueue сохраняет и возвращает элемент в статусе pending', () async {
    final item = await outbox.enqueue(kind: 'workout.import', payload: {'a': 1});
    expect(item.kind, 'workout.import');
    expect(item.status, OutboxStatus.pending);
    final list = await outbox.list();
    expect(list, hasLength(1));
    expect(list.first.payload['a'], 1);
  });

  test('list отсортирован по createdAt по возрастанию', () async {
    final a = await outbox.enqueue(kind: 'k', payload: {'n': 1});
    final b = await outbox.enqueue(kind: 'k', payload: {'n': 2});
    final list = await outbox.list();
    expect(list.map((e) => e.id).toList(), [a.id, b.id]);
  });

  test('markSent удаляет элемент, markFailed помечает failed + attempts', () async {
    final a = await outbox.enqueue(kind: 'k', payload: {});
    await outbox.markFailed(a.id, 'boom');
    var list = await outbox.list();
    expect(list.first.status, OutboxStatus.failed);
    expect(list.first.attempts, 1);
    expect(list.first.lastError, 'boom');
    await outbox.markSent(a.id);
    list = await outbox.list();
    expect(list, isEmpty);
  });

  test('переживает пересоздание (персист в KvStore)', () async {
    await outbox.enqueue(kind: 'k', payload: {'x': 9});
    final revived = Outbox(store);
    final list = await revived.list();
    expect(list, hasLength(1));
    expect(list.first.payload['x'], 9);
  });
}
