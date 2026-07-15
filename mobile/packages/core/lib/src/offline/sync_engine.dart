// ignore_for_file: prefer_initializing_formals
import 'outbox.dart';

/// Обработчик отправки одного элемента очереди на сервер (по kind).
typedef SyncHandler = Future<void> Function(OutboxItem item);

/// Сетевой сбой во время отправки: слив прерывается, элемент остаётся в очереди.
class OfflineException implements Exception {
  OfflineException([this.message]);
  final String? message;
  @override
  String toString() => 'OfflineException(${message ?? ''})';
}

class SyncResult {
  const SyncResult({required this.sent, required this.failed, required this.stoppedOffline});
  final int sent;
  final int failed;
  final bool stoppedOffline;
}

/// Сливает [Outbox] на сервер по порядку. Сетевой сбой прерывает слив
/// (повторим при следующей связи); отказ сервера помечает элемент failed и
/// НЕ блокирует остальные.
class SyncEngine {
  SyncEngine(
    this._outbox, {
    required Map<String, SyncHandler> handlers,
    bool Function(Object error)? isOffline,
  })  : _handlers = handlers,
        _isOffline = isOffline ?? ((e) => e is OfflineException);

  final Outbox _outbox;
  final Map<String, SyncHandler> _handlers;
  final bool Function(Object error) _isOffline;

  Future<SyncResult> drain() async {
    int sent = 0;
    int failed = 0;
    final items = await _outbox.list();
    for (final item in items) {
      if (item.status == OutboxStatus.sending) continue;
      await _outbox.markSending(item.id);
      final handler = _handlers[item.kind];
      if (handler == null) {
        await _outbox.markFailed(item.id, 'Неизвестный тип: ${item.kind}');
        failed++;
        continue;
      }
      try {
        await handler(item);
        await _outbox.markSent(item.id);
        sent++;
      } catch (e) {
        if (_isOffline(e)) {
          // Сеть пропала: вернуть элемент в pending и прервать слив (повторим при
          // следующей связи; attempts не считаем — это не отказ сервера).
          await _outbox.markPending(item.id);
          return SyncResult(sent: sent, failed: failed, stoppedOffline: true);
        }
        await _outbox.markFailed(item.id, '$e');
        failed++;
      }
    }
    return SyncResult(sent: sent, failed: failed, stoppedOffline: false);
  }
}
