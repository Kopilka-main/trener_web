import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'trainer_home.dart';

/// Диалог в списке у тренера: клиент + сводка непрочитанного.
class Conversation {
  Conversation({
    required this.clientId,
    required this.clientName,
    required this.lastMessageAt,
    required this.unreadCount,
  });

  final String clientId;
  final String clientName;
  final DateTime? lastMessageAt;
  final int unreadCount;
}

/// Снимок диалога: сообщения, момент прочтения КЛИЕНТОМ (для ✓✓), закреплённые.
class TrainerChatThread {
  TrainerChatThread({required this.messages, required this.clientReadAt, required this.pinned});
  final List<ChatMessage> messages;
  final DateTime? clientReadAt;
  final List<ChatMessage> pinned;
}

/// Доступ к чатам тренера: список диалогов (с именами), лента, отправка, прочтение.
class TrainerChatApi {
  TrainerChatApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<Conversation>> listConversations() async {
    final List<Map<String, dynamic>> r = await Future.wait(<Future<Map<String, dynamic>>>[
      _api.getJson('/api/conversations'),
      _api.getJson('/api/clients'),
    ]);

    final List<dynamic> clients = (r[1]['clients'] as List<dynamic>?) ?? <dynamic>[];
    final Map<String, String> names = <String, String>{
      for (final Map<String, dynamic> c in clients.cast<Map<String, dynamic>>())
        (c['id'] as String? ?? ''):
            '${c['firstName'] ?? ''} ${c['lastName'] ?? ''}'.trim(),
    };

    final List<dynamic> raw = (r[0]['conversations'] as List<dynamic>?) ?? <dynamic>[];
    final List<Conversation> list = raw.cast<Map<String, dynamic>>().map((Map<String, dynamic> j) {
      final String cid = j['clientId'] as String? ?? '';
      final String? lm = j['lastMessageAt'] as String?;
      return Conversation(
        clientId: cid,
        clientName: (names[cid] ?? '').isNotEmpty ? names[cid]! : 'Клиент',
        lastMessageAt: lm != null ? DateTime.tryParse(lm)?.toLocal() : null,
        unreadCount: (j['unreadCount'] as num?)?.toInt() ?? 0,
      );
    }).toList();
    // Свежие диалоги — сверху.
    list.sort((Conversation a, Conversation b) =>
        (b.lastMessageAt ?? DateTime.fromMillisecondsSinceEpoch(0))
            .compareTo(a.lastMessageAt ?? DateTime.fromMillisecondsSinceEpoch(0)));
    return list;
  }

  Future<TrainerChatThread> loadMessages(String clientId) async {
    final Map<String, dynamic> r = await _api.getJson('/api/clients/$clientId/messages');
    final String? readAt = r['clientLastReadAt'] as String?;
    return TrainerChatThread(
      messages: ChatMessage.listFrom(r['messages']),
      clientReadAt: readAt != null ? DateTime.tryParse(readAt)?.toLocal() : null,
      pinned: ChatMessage.listFrom(r['pinnedMessages']),
    );
  }

  Future<bool> send(String clientId, String body, String? replyToId) async {
    try {
      await _api.postJson('/api/clients/$clientId/messages', <String, dynamic>{
        'body': body,
        'replyTo': ?replyToId,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> markRead(String clientId) async {
    try {
      await _api.postJson('/api/clients/$clientId/messages/read');
      // Прочтение меняет trainerLastReadAt на сервере → счётчики устаревают.
      // Инвалидируем зависимые срезы ВНУТРИ метода, СТРОГО после успешного POST
      // (как в клиентском приложении): иначе бейдж непрочитанных в списке диалогов
      // и плитка «Сообщения» на главной залипают, пока экран не обновят вручную.
      _ref.invalidate(trainerConversationsProvider);
      _ref.invalidate(trainerHomeProvider);
    } catch (_) {
      // не критично
    }
  }
}

final Provider<TrainerChatApi> trainerChatApiProvider =
    Provider<TrainerChatApi>((ref) => TrainerChatApi(ref));

final FutureProvider<List<Conversation>> trainerConversationsProvider =
    FutureProvider<List<Conversation>>((ref) => ref.read(trainerChatApiProvider).listConversations());

/// Лента конкретного диалога по clientId.
final FutureProviderFamily<TrainerChatThread, String> trainerChatMessagesProvider =
    FutureProvider.family<TrainerChatThread, String>(
        (ref, String clientId) => ref.read(trainerChatApiProvider).loadMessages(clientId));
