import 'package:core/core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';

/// Версия приложения для аналитики (держим в синхроне с pubspec `version`).
const String analyticsAppVersion = '1.1.1';

/// Путь батч-отправки лога экранов клиента.
const String _analyticsEventsPath = '/api/client/analytics/events';

/// Путь go_router → короткий человекочитаемый ключ экрана. Детальная тренировка
/// (`/workout/<id>`) маппится по началу; неизвестный путь оставляем как есть.
String screenKeyForPath(String path) {
  if (path == '/home') return 'main';
  if (path == '/workouts') return 'workouts';
  if (path.startsWith('/workout/')) return 'workout';
  if (path == '/calendar') return 'calendar';
  if (path == '/progress') return 'progress';
  if (path == '/chat') return 'chat';
  if (path == '/trainer') return 'trainer';
  if (path == '/connect') return 'connect';
  if (path == '/settings') return 'settings';
  if (path == '/notifications') return 'notifications';
  if (path == '/knowledge') return 'knowledge';
  return path;
}

/// Обвязка лога экранов поверх go_router: держит один [AnalyticsScreenLog],
/// слушает смену маршрута и сообщает ему текущий экран — только когда
/// пользователь авторизован. Живёт столько же, сколько корневой виджет.
class ScreenAnalytics {
  ScreenAnalytics(this._ref) {
    _log = AnalyticsScreenLog(appVersion: analyticsAppVersion, post: _send);
  }

  final WidgetRef _ref;
  late final AnalyticsScreenLog _log;
  ValueListenable<RouteInformation>? _routeInfo;

  /// Отправка батча: без авторизации не шлём (иначе 401 в цикле). Возврат без
  /// ошибки — накопленное просто отбрасывается вместе с чужой сессией.
  Future<void> _send(Map<String, dynamic> body) async {
    if (_ref.read(sessionProvider).status != AuthStatus.authenticated) return;
    await _ref.read(apiClientProvider).postJson(_analyticsEventsPath, body);
  }

  /// Подписаться на смену маршрута и залогировать текущий экран.
  void start() {
    final ValueListenable<RouteInformation> info =
        _ref.read(routerProvider).routeInformationProvider;
    _routeInfo = info;
    info.addListener(_onRouteChanged);
    _onRouteChanged(); // начальный путь
  }

  void _onRouteChanged() {
    // Логируем только авторизованного пользователя (до логина — тишина).
    if (_ref.read(sessionProvider).status != AuthStatus.authenticated) return;
    _log.enter(screenKeyForPath(_routeInfo!.value.uri.path));
  }

  void dispose() {
    _routeInfo?.removeListener(_onRouteChanged);
    _log.dispose();
  }
}
