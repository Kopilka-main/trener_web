import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Простой лог экранов (аналитика): замеряет, какой экран открыт и сколько
/// секунд, копит события в буфер и батчами отправляет на сервер.
///
/// Не тянет сторонних зависимостей и ничего не знает про роутер — приложение
/// само сообщает о смене экрана через [enter]. Всё best-effort и fire-and-forget:
/// ошибка отправки не роняет UI, буфер просто уедет со следующим flush.
///
/// Жизненный цикл: подписывается на [WidgetsBinding] и не считает временем на
/// экране то, что приложение провело в фоне.
class AnalyticsScreenLog with WidgetsBindingObserver {
  AnalyticsScreenLog({
    required this.post,
    required this.appVersion,
  }) : _sessionId = DateTime.now().microsecondsSinceEpoch.toString() {
    _timer = Timer.periodic(_flushInterval, (Timer _) => unawaited(flush()));
    WidgetsBinding.instance.addObserver(this);
  }

  /// Отправка батча на сервер (приложение подставляет свой путь и apiClient).
  final Future<void> Function(Map<String, dynamic> body) post;

  /// Версия приложения (строка вида '1.1.1') — уходит в теле батча.
  final String appVersion;

  final String _sessionId;

  /// Как часто батч уходит на сервер.
  static const Duration _flushInterval = Duration(seconds: 30);

  /// Максимум событий в одном батче (остальное уедет следующим flush).
  static const int _maxBatch = 300;

  final List<Map<String, dynamic>> _buffer = <Map<String, dynamic>>[];
  Timer? _timer;
  bool _flushing = false;

  /// Текущий открытый экран и момент входа в него. `null` — экрана нет либо
  /// отсчёт приостановлен (фон).
  String? _currentScreen;
  DateTime? _enteredAt;
  bool _disposed = false;

  /// 'android' / 'ios' / 'other' — платформа для тела батча.
  String get _platform {
    final TargetPlatform p = defaultTargetPlatform;
    if (p == TargetPlatform.android) return 'android';
    if (p == TargetPlatform.iOS) return 'ios';
    return 'other';
  }

  /// Сообщить о переходе на экран [screenKey]. Если это тот же экран, что уже
  /// открыт, — ничего не делаем (не сбрасываем таймер). Иначе закрываем
  /// предыдущий (эмитим его длительность в буфер) и начинаем отсчёт нового.
  void enter(String screenKey) {
    if (_disposed) return;
    if (_currentScreen == screenKey) return;
    _closeCurrent();
    _currentScreen = screenKey;
    _enteredAt = DateTime.now();
  }

  /// «Закрыть» текущий экран: если он есть и отсчёт идёт — добавить событие с его
  /// длительностью в буфер. [_currentScreen] сохраняем (вызывающий решит, что с
  /// ним делать), но [_enteredAt] обнуляем — повторный вызов не задвоит событие.
  void _closeCurrent() {
    final String? screen = _currentScreen;
    final DateTime? at = _enteredAt;
    if (screen == null || at == null) return;
    final int seconds =
        (DateTime.now().difference(at).inMilliseconds / 1000).round();
    _buffer.add(<String, dynamic>{
      'screen': screen,
      'seconds': seconds,
      // UTC с суффиксом Z — сервер требует ISO-8601 в UTC (иначе 400 на валидации).
      'enteredAt': at.toUtc().toIso8601String(),
    });
    _enteredAt = null;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
        // Уходим в фон: закрываем текущий экран (эмитим накопленную длительность)
        // и отправляем то, что есть. [_currentScreen] сохраняем — при возврате
        // продолжим отсчёт того же экрана; фон временем на экране не считается.
        _closeCurrent();
        unawaited(flush());
        break;
      case AppLifecycleState.resumed:
        // Возврат из фона: продолжаем отсчёт того же экрана с текущего момента.
        if (_currentScreen != null) _enteredAt = DateTime.now();
        break;
      case AppLifecycleState.detached:
        break;
    }
  }

  /// Отправить накопленные события батчем. Пустой буфер — выход. Успех — убираем
  /// отправленные; ошибка — оставляем буфер для повтора на следующем flush.
  /// Ничего не ждём в UI (fire-and-forget), исключения глотаем.
  Future<void> flush() async {
    // Не запускаем параллельный flush: периодический таймер, уход в фон и dispose
    // могут наложиться и задвоить отправку одних и тех же событий.
    if (_flushing || _buffer.isEmpty) return;
    _flushing = true;
    final int take = _buffer.length > _maxBatch ? _maxBatch : _buffer.length;
    final List<Map<String, dynamic>> batch =
        List<Map<String, dynamic>>.of(_buffer.take(take));
    final Map<String, dynamic> body = <String, dynamic>{
      'sessionId': _sessionId,
      'appVersion': appVersion,
      'platform': _platform,
      'events': batch,
    };
    try {
      await post(body);
      // Убираем ровно отправленный префикс; события, добавленные за время
      // ожидания (навигация во время запроса), остаются в буфере.
      _buffer.removeRange(0, take);
    } catch (_) {
      // Нет сети / токена / сервер ответил ошибкой — оставляем буфер как есть.
    } finally {
      _flushing = false;
    }
  }

  /// Остановить лог: снять таймер и наблюдатель, доотправить остаток.
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _timer?.cancel();
    _timer = null;
    WidgetsBinding.instance.removeObserver(this);
    _closeCurrent();
    unawaited(flush());
  }
}
