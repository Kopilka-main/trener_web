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

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
      final FirebaseMessaging messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final String? token = await messaging.getToken();
      if (token != null) await _register(token);
      messaging.onTokenRefresh.listen(_register);
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
}

final Provider<PushService> pushServiceProvider = Provider<PushService>(
  (ref) => PushService(ref.read(apiClientProvider), ref.read(pushRegisterPathProvider)),
);
