/// Роль отправителя сообщения (зеркало senderRole из @trener/shared).
enum SenderRole { trainer, client }

/// Вид сообщения (зеркало messageKindSchema): обычный текст, задача, системная плашка.
enum MessageKind { text, task, system }

SenderRole _roleFrom(String? s) => s == 'client' ? SenderRole.client : SenderRole.trainer;

MessageKind _kindFrom(String? s) => switch (s) {
      'task' => MessageKind.task,
      'system' => MessageKind.system,
      _ => MessageKind.text,
    };

/// Сообщение чата (зеркало messageResponseSchema).
class ChatMessage {
  ChatMessage({
    required this.id,
    required this.senderRole,
    required this.body,
    required this.createdAt,
    required this.kind,
    required this.taskDone,
  });

  final String id;
  final SenderRole senderRole;
  final String body;
  final DateTime createdAt;
  final MessageKind kind;
  final bool? taskDone;

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: j['id'] as String? ?? '',
        senderRole: _roleFrom(j['senderRole'] as String?),
        body: j['body'] as String? ?? '',
        createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal() ??
            DateTime.fromMillisecondsSinceEpoch(0),
        kind: _kindFrom(j['kind'] as String?),
        taskDone: j['taskDone'] as bool?,
      );

  static List<ChatMessage> listFrom(dynamic raw) =>
      ((raw as List<dynamic>?) ?? <dynamic>[])
          .cast<Map<String, dynamic>>()
          .map(ChatMessage.fromJson)
          .toList();
}
