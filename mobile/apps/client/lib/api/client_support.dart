import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Обращение клиента в поддержку приложения.
/// POST /api/client-app/support с телом {'text': ...} → {'ok': true}.
/// Аутентификация обеспечивается общим [ApiClient] (куки/токен).
class ClientSupportApi {
  ClientSupportApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  /// Отправить обращение (текст 1..5000 символов). Исключение пробрасываем наверх.
  Future<void> send(String text) async {
    await _api.postJson('/api/client-app/support', <String, dynamic>{'text': text});
  }
}

final Provider<ClientSupportApi> clientSupportApiProvider =
    Provider<ClientSupportApi>((ref) => ClientSupportApi(ref));
