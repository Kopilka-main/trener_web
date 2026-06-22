import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'client_home.dart';
import 'client_packages.dart';

/// Снимок диалога клиента: сообщения, момент прочтения ТРЕНЕРОМ (для ✓✓),
/// закреплённые сообщения.
class ClientChatData {
  ClientChatData({required this.messages, required this.trainerReadAt, required this.pinned});
  final List<ChatMessage> messages;
  final DateTime? trainerReadAt;
  final List<ChatMessage> pinned;
}

/// Доступ к чату клиента с тренером: загрузка, отправка (с ответом), задачи, прочтение.
class ClientChatApi {
  ClientChatApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<ClientChatData> load() async {
    final Map<String, dynamic> r = await _api.getJson('/api/client/chat/messages');
    final String? readAt = r['trainerLastReadAt'] as String?;
    return ClientChatData(
      messages: ChatMessage.listFrom(r['messages']),
      trainerReadAt: readAt != null ? DateTime.tryParse(readAt)?.toLocal() : null,
      pinned: ChatMessage.listFrom(r['pinnedMessages']),
    );
  }

  Future<bool> send(String body, String? replyToId) async {
    try {
      await _api.postJson('/api/client/chat/messages', <String, dynamic>{
        'body': body,
        'replyTo': ?replyToId,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Закрыть задачу (однократно). Возвращает true при успехе; 404 «уже закрыта»
  /// или иная ошибка → false (лента всё равно перечитается поллингом).
  Future<bool> completeTask(String id) async {
    try {
      await _api.postJson('/api/client/chat/tasks/$id/complete');
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> markRead() async {
    try {
      await _api.postJson('/api/client/chat/read');
      // Прочтение меняет счётчик непрочитанных на сервере — освежаем зависимые
      // срезы, иначе плитка «Чат» на главной и пункт «новые сообщения» в
      // уведомлениях залипают акцентом, пока экран не обновят вручную.
      _ref.invalidate(clientUnreadProvider);
      _ref.invalidate(clientHomeProvider);
    } catch (_) {
      // не критично
    }
  }
}

final Provider<ClientChatApi> clientChatApiProvider =
    Provider<ClientChatApi>((ref) => ClientChatApi(ref));

final FutureProvider<ClientChatData> clientChatProvider =
    FutureProvider<ClientChatData>((ref) => ref.read(clientChatApiProvider).load());
