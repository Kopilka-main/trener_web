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
    this.maxAttempts = 5,
  })  : _handlers = handlers,
        _isOffline = isOffline ?? ((e) => e is OfflineException);

  final Outbox _outbox;
  final Map<String, SyncHandler> _handlers;
  final bool Function(Object error) _isOffline;
  /// Сколько раз переигрывать элемент, отвергнутый сервером (не сетевая
  /// ошибка), прежде чем оставить его как dead-letter (не трогать на drain()).
  final int maxAttempts;

  /// Реентрант-гвард: слив уже идёт. Триггеров несколько (мутации шаблонов,
  /// 20-сек тикер, экран проведения), а инстанс движка один на провайдер —
  /// поэтому два параллельных слива могут повторно отправить один элемент
  /// (для `template.create` без идемпотентности это дубль на сервере).
  bool _draining = false;
  /// Во время активного слива пришёл ещё один запрос (или добавился элемент) —
  /// по завершении прогоняем `_drainOnce()` ещё раз, чтобы его не потерять.
  bool _rerun = false;

  /// Слить очередь. Если слив уже идёт — не запускаем второй параллельно (иначе
  /// двойная отправка), а взводим повтор и возвращаем нейтральный результат.
  Future<SyncResult> drain() async {
    if (_draining) {
      _rerun = true;
      return const SyncResult(sent: 0, failed: 0, stoppedOffline: false);
    }
    _draining = true;
    try {
      SyncResult res = await _drainOnce();
      while (_rerun) {
        _rerun = false;
        res = await _drainOnce();
      }
      return res;
    } finally {
      _draining = false;
    }
  }

  Future<SyncResult> _drainOnce() async {
    int sent = 0;
    int failed = 0;
    final items = await _outbox.list();
    for (final item in items) {
      if (item.status == OutboxStatus.sending) continue;
      if (item.status == OutboxStatus.failed && item.attempts >= maxAttempts) {
        // Отравленный элемент: сервер уже отверг его maxAttempts раз — дальше
        // не переигрываем (dead-letter), чтобы не мусорить каждый drain().
        continue;
      }
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
