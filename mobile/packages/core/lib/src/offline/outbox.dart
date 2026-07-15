import 'package:uuid/uuid.dart';

import 'kv_store.dart';

enum OutboxStatus { pending, sending, failed }

/// Один элемент очереди исходящих изменений. [payload] — доменные данные,
/// [kind] выбирает обработчик синка. [id] — клиентский UUID (ключ идемпотентности).
class OutboxItem {
  OutboxItem({
    required this.id,
    required this.kind,
    required this.payload,
    required this.createdAt,
    this.status = OutboxStatus.pending,
    this.attempts = 0,
    this.lastError,
  });

  final String id;
  final String kind;
  final Map<String, dynamic> payload;
  final int createdAt;
  OutboxStatus status;
  int attempts;
  String? lastError;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'kind': kind,
        'payload': payload,
        'createdAt': createdAt,
        'status': status.name,
        'attempts': attempts,
        'lastError': lastError,
      };

  factory OutboxItem.fromJson(Map<String, dynamic> j) => OutboxItem(
        id: j['id'] as String,
        kind: j['kind'] as String,
        payload: (j['payload'] as Map).cast<String, dynamic>(),
        createdAt: (j['createdAt'] as num).toInt(),
        status: OutboxStatus.values.firstWhere(
          (s) => s.name == j['status'],
          orElse: () => OutboxStatus.pending,
        ),
        attempts: (j['attempts'] as num?)?.toInt() ?? 0,
        lastError: j['lastError'] as String?,
      );
}

/// Персистентная FIFO-очередь исходящих изменений (на диске через [KvStore]).
class Outbox {
  Outbox(this._store, {Uuid uuid = const Uuid(), int Function()? clock})
      // ignore: prefer_initializing_formals
      : _uuid = uuid,
        _clock = clock ?? (() => DateTime.now().millisecondsSinceEpoch);

  static const String _key = 'outbox';
  final KvStore _store;
  final Uuid _uuid;
  final int Function() _clock;

  Future<List<OutboxItem>> _load() async {
    final raw = await _store.readList(_key) ?? <Map<String, dynamic>>[];
    final items = raw.map(OutboxItem.fromJson).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return items;
  }

  Future<void> _save(List<OutboxItem> items) =>
      _store.writeList(_key, items.map((e) => e.toJson()).toList());

  Future<List<OutboxItem>> list() => _load();

  Future<OutboxItem> enqueue({
    required String kind,
    required Map<String, dynamic> payload,
  }) async {
    final item = OutboxItem(
      id: _uuid.v4(),
      kind: kind,
      payload: payload,
      createdAt: _clock(),
    );
    final items = await _load()..add(item);
    await _save(items);
    return item;
  }

  Future<void> _mutate(String id, void Function(OutboxItem) fn) async {
    final items = await _load();
    final i = items.indexWhere((e) => e.id == id);
    if (i == -1) return;
    fn(items[i]);
    await _save(items);
  }

  Future<void> markSending(String id) =>
      _mutate(id, (it) => it.status = OutboxStatus.sending);

  Future<void> markFailed(String id, String error) => _mutate(id, (it) {
        it.status = OutboxStatus.failed;
        it.attempts += 1;
        it.lastError = error;
      });

  Future<void> markSent(String id) async {
    final items = await _load()..removeWhere((e) => e.id == id);
    await _save(items);
  }
}
