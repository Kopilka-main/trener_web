import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/session.dart';
import 'api_client.dart';

/// Базовый URL API. Каждое приложение переопределяет провайдер своим доменом
/// (тренер — app.fitbond.ru, клиент — my.fitbond.ru).
final Provider<String> baseUrlProvider = Provider<String>(
  (ref) => throw UnimplementedError('Переопределите baseUrlProvider в приложении'),
);

/// Готовый API-клиент: берёт токен из текущей сессии (в памяти) и сбрасывает
/// сессию на 401.
final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    baseUrl: ref.read(baseUrlProvider),
    tokenProvider: () async => ref.read(sessionProvider).token,
    onUnauthorized: () => ref.read(sessionProvider.notifier).clear(),
  );
});
