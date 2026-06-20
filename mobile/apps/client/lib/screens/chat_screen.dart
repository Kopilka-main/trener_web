import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_auth.dart';
import '../api/client_chat.dart';

/// Чат клиента с тренером. Поллинг ленты, отметка прочтения при входе и при
/// каждом новом сообщении тренера, имя тренера в шапке, ветка «не подключён».
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  Timer? _poll;
  String? _lastTrainerMsgId;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(() => ref.read(clientChatApiProvider).markRead());
    // Поллинг новых сообщений (как в вебе — 4с), пока экран открыт.
    _poll = Timer.periodic(const Duration(seconds: 4), (_) {
      ref.invalidate(clientChatProvider);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<bool> _send(String body, String? replyToId) async {
    final bool ok = await ref.read(clientChatApiProvider).send(body, replyToId);
    if (ok) ref.invalidate(clientChatProvider);
    return ok;
  }

  /// Авто-отметка прочтения при появлении нового сообщения от тренера.
  void _maybeMarkRead(ClientChatData d) {
    String? id;
    for (final ChatMessage m in d.messages.reversed) {
      if (m.senderRole == SenderRole.trainer) {
        id = m.id;
        break;
      }
    }
    if (id != null && id != _lastTrainerMsgId) {
      _lastTrainerMsgId = id;
      Future<void>.microtask(() => ref.read(clientChatApiProvider).markRead());
    }
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<ClientChatData> chat = ref.watch(clientChatProvider);
    final bool linked = ref.watch(clientLinkedProvider).valueOrNull ?? true;
    final String title = ref.watch(clientTrainerNameProvider).valueOrNull ?? 'Тренер';

    if (!linked) {
      return Scaffold(
        appBar: AppBar(title: const Text('Чат')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text('Подключите тренера, чтобы написать ему.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: context.colors.inkMuted)),
                const SizedBox(height: 16),
                FilledButton(
                    onPressed: () => context.push('/connect'),
                    child: const Text('Подключить тренера')),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(title)),
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
        data: (ClientChatData d) {
          _maybeMarkRead(d);
          return ChatThreadView(
            messages: d.messages,
            myRole: SenderRole.client,
            otherReadAt: d.trainerReadAt,
            pinned: d.pinned,
            onSend: _send,
            onCompleteTask: (String id) async {
              await ref.read(clientChatApiProvider).completeTask(id);
              ref.invalidate(clientChatProvider);
            },
            onRefresh: () async => ref.invalidate(clientChatProvider),
          );
        },
      ),
    );
  }
}
