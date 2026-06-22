import 'dart:io';

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
      // iOS: по умолчанию пуш в активном приложении не показывает баннер —
      // включаем alert/badge/sound, чтобы вёл себя как на Android.
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      await _waitForApns(messaging);
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

  /// iOS: FCM `getToken()` бросает `apns-token-not-set-yet`, пока система не
  /// зарегистрирует APNs-токен. Ждём его до ~5 секунд, иначе токен не уедет на
  /// сервер и пуши на iPhone не приходят. На Android это no-op (APNs нет).
  Future<void> _waitForApns(FirebaseMessaging messaging) async {
    if (!Platform.isIOS) return;
    String? apns = await messaging.getAPNSToken();
    for (int i = 0; i < 10 && apns == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      apns = await messaging.getAPNSToken();
    }
  }

  /// Диагностика доставки пушей — показывает, на каком шаге рвётся цепочка
  /// (Firebase init → разрешение → APNs-токен → FCM-токен → регистрация на
  /// сервере). Возвращает читаемый многострочный отчёт.
  Future<String> diagnose() async {
    final StringBuffer b = StringBuffer();
    b.writeln('platform: ${Platform.isIOS ? 'ios' : 'android'}');
    b.writeln('register path: $_registerPath');
    try {
      await Firebase.initializeApp();
      b.writeln('firebase init: OK');
    } catch (e) {
      b.writeln('firebase init: FAIL — $e');
      return b.toString();
    }
    final FirebaseMessaging m = FirebaseMessaging.instance;
    try {
      final NotificationSettings s = await m.getNotificationSettings();
      b.writeln('permission: ${s.authorizationStatus.name}');
    } catch (e) {
      b.writeln('permission: err — $e');
    }
    if (Platform.isIOS) {
      try {
        await _waitForApns(m);
        final String? apns = await m.getAPNSToken();
        b.writeln('APNs token: ${apns == null ? 'NULL (НЕТ!)' : 'OK (${apns.length} симв.)'}');
      } catch (e) {
        b.writeln('APNs token: err — $e');
      }
    }
    String? fcm;
    try {
      fcm = await m.getToken();
      b.writeln('FCM token: ${fcm == null ? 'NULL (НЕТ!)' : 'OK ${fcm.substring(0, 16)}…'}');
    } catch (e) {
      b.writeln('FCM token: FAIL — $e');
    }
    if (fcm != null) {
      try {
        final String platform = Platform.isIOS ? 'ios' : 'android';
        await _api.postJson(_registerPath, <String, String>{'token': fcm, 'platform': platform});
        b.writeln('server register: OK');
      } catch (e) {
        b.writeln('server register: FAIL — $e');
      }
    }
    return b.toString();
  }

  Future<void> _register(String token) async {
    try {
      final String platform = Platform.isIOS ? 'ios' : 'android';
      await _api.postJson(_registerPath, <String, String>{'token': token, 'platform': platform});
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
        await _waitForApns(m);
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
