import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Доступ к чату клиента с тренером: загрузка ленты, отправка, отметка прочтения.
class ClientChatApi {
  ClientChatApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<ChatMessage>> load() async {
    final Map<String, dynamic> r = await _api.getJson('/api/client/chat/messages');
    return ChatMessage.listFrom(r['messages']);
  }

  Future<bool> send(String body) async {
    try {
      await _api.postJson('/api/client/chat/messages', <String, String>{'body': body});
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> markRead() async {
    try {
      await _api.postJson('/api/client/chat/read');
    } catch (_) {
      // не критично — отметку повторим при следующем заходе
    }
  }
}

final Provider<ClientChatApi> clientChatApiProvider =
    Provider<ClientChatApi>((ref) => ClientChatApi(ref));

final FutureProvider<List<ChatMessage>> clientChatProvider =
    FutureProvider<List<ChatMessage>>((ref) => ref.read(clientChatApiProvider).load());
