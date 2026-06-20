import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_chat.dart';

/// Чат клиента с тренером. Лёгкий поллинг ленты, отметка прочтения при входе.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // Отметить прочитанным при входе.
    Future<void>.microtask(() => ref.read(clientChatApiProvider).markRead());
    // Поллинг новых сообщений, пока экран открыт.
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      ref.invalidate(clientChatProvider);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<bool> _send(String body) async {
    final bool ok = await ref.read(clientChatApiProvider).send(body);
    if (ok) ref.invalidate(clientChatProvider);
    return ok;
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<ChatMessage>> chat = ref.watch(clientChatProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Тренер')),
      body: chat.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Text('Не удалось загрузить чат'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => ref.invalidate(clientChatProvider),
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
        data: (List<ChatMessage> messages) => ChatThreadView(
          messages: messages,
          myRole: SenderRole.client,
          onSend: _send,
          onRefresh: () async => ref.invalidate(clientChatProvider),
        ),
      ),
    );
  }
}
