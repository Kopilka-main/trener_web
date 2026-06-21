import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_chat.dart';
import '../api/trainer_home.dart';

/// Тред переписки тренера с конкретным клиентом. Поллинг + отметка прочтения.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.clientId, required this.clientName});

  final String clientId;
  final String clientName;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _markReadAndRefresh();
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      ref.invalidate(trainerChatMessagesProvider(widget.clientId));
    });
  }

  /// Отметить тред прочитанным и обновить счётчики (плитка «Сообщения» + список диалогов).
  Future<void> _markReadAndRefresh() async {
    try {
      await ref.read(trainerChatApiProvider).markRead(widget.clientId);
    } catch (_) {}
    if (!mounted) return;
    ref.invalidate(trainerHomeProvider);
    ref.invalidate(trainerConversationsProvider);
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<bool> _send(String body, String? replyToId) async {
    final bool ok = await ref.read(trainerChatApiProvider).send(widget.clientId, body, replyToId);
    if (ok) {
      ref.invalidate(trainerChatMessagesProvider(widget.clientId));
      // Диалог мог только что появиться — обновляем список «Сообщения».
      ref.invalidate(trainerConversationsProvider);
    }
    return ok;
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<TrainerChatThread> chat =
        ref.watch(trainerChatMessagesProvider(widget.clientId));
    return Scaffold(
      appBar: AppBar(title: Text(widget.clientName)),
      body: chat.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Text('Не удалось загрузить чат'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => ref.invalidate(trainerChatMessagesProvider(widget.clientId)),
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
        data: (TrainerChatThread d) => ChatThreadView(
          messages: d.messages,
          myRole: SenderRole.trainer,
          otherReadAt: d.clientReadAt,
          pinned: d.pinned,
          onSend: _send,
          onRefresh: () async => ref.invalidate(trainerChatMessagesProvider(widget.clientId)),
        ),
      ),
    );
  }
}
