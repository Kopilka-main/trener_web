import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/api_provider.dart';

/// Путь регистрации device-token на бэке (свой у каждого приложения:
/// тренер — /api/push/device, клиент — /api/client/push/device).
final Provider<String> pushRegisterPathProvider = Provider<String>(
  (ref) => throw UnimplementedError('Переопределите pushRegisterPathProvider в приложении'),
);

/// Инициализация FCM и регистрация device-token на сервере. Всё обёрнуто в
/// try/catch и вызывается «забыто» (fire-and-forget) — пуши не должны ломать UI.
class PushService {
  PushService(this._api, this._registerPath);

  final ApiClient _api;
  final String _registerPath;

  /// [onTap] вызывается при открытии приложения по тапу на пуш — с `url` из
  /// data-полей сообщения (например '/chat' или '/clients/<id>/chat'). Приложение
  /// само маппит url в свой маршрут.
  ///
  /// [onForeground] вызывается при приходе пуша, когда приложение активно — чтобы
  /// обновить данные на экране сразу (иначе видимая карточка отстаёт от пуша).
  Future<void> init({
    void Function(String? url)? onTap,
    void Function(String? url)? onForeground,
  }) async {
    try {
      await Firebase.initializeApp();
      final FirebaseMessaging messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final String? token = await messaging.getToken();
      if (token != null) await _register(token);
      messaging.onTokenRefresh.listen(_register);

      // Пуш пришёл при активном приложении — даём приложению обновить данные.
      if (onForeground != null) {
        FirebaseMessaging.onMessage.listen((RemoteMessage m) {
          onForeground(m.data['url'] as String?);
        });
      }

      if (onTap != null) {
        // Холодный старт по тапу на пуш (приложение было закрыто).
        final RemoteMessage? initial = await messaging.getInitialMessage();
        if (initial != null) onTap(initial.data['url'] as String?);
        // Тап по пушу, когда приложение в фоне.
        FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage m) {
          onTap(m.data['url'] as String?);
        });
      }
    } catch (_) {
      // Нет конфигурации/разрешения/сети — тихо пропускаем.
    }
  }

  Future<void> _register(String token) async {
    try {
      await _api.postJson(_registerPath, <String, String>{'token': token, 'platform': 'android'});
    } catch (_) {
      // регистрация токена — best-effort
    }
  }

  /// Включены ли уведомления (разрешение выдано).
  Future<bool> isEnabled() async {
    try {
      await Firebase.initializeApp();
      final NotificationSettings s = await FirebaseMessaging.instance.getNotificationSettings();
      return s.authorizationStatus == AuthorizationStatus.authorized ||
          s.authorizationStatus == AuthorizationStatus.provisional;
    } catch (_) {
      return false;
    }
  }

  /// Запросить разрешение и зарегистрировать токен. true — если разрешение выдано.
  Future<bool> enable() async {
    try {
      await Firebase.initializeApp();
      final FirebaseMessaging m = FirebaseMessaging.instance;
      final NotificationSettings s = await m.requestPermission();
      final bool ok = s.authorizationStatus == AuthorizationStatus.authorized ||
          s.authorizationStatus == AuthorizationStatus.provisional;
      if (ok) {
        final String? token = await m.getToken();
        if (token != null) await _register(token);
      }
      return ok;
    } catch (_) {
      return false;
    }
  }
}

final Provider<PushService> pushServiceProvider = Provider<PushService>(
  (ref) => PushService(ref.read(apiClientProvider), ref.read(pushRegisterPathProvider)),
);
