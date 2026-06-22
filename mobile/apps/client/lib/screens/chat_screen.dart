import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_auth.dart';
import '../api/client_chat.dart';
import '../api/client_trainer.dart';

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
    final TrainerPublic? trainer = ref.watch(clientTrainerProvider).valueOrNull;

    if (!linked) {
      // Заглушка как в вебе: «Подключите тренера, чтобы написать ему.» + ссылка.
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
      appBar: _TrainerHeader(trainer: trainer),
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
              // Закрываем задачу и перечитываем ленту (источник истины), даже если
              // сервер ответил 404 «уже закрыта» — список приведёт состояние к норме.
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

/// Шапка чата как в вебе: аватар тренера 40×40 (фото или инициалы) + имя
/// (15px semibold) + опц. title тренера (12px ink-muted). Нижняя граница — line.
class _TrainerHeader extends ConsumerWidget implements PreferredSizeWidget {
  const _TrainerHeader({required this.trainer});
  final TrainerPublic? trainer;

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final TrainerPublic? t = trainer;
    final String name = t != null ? t.fullName : 'Чат';
    final String? title = (t?.title != null && t!.title!.trim().isNotEmpty) ? t.title : null;
    final String? avatarUrl = (t?.avatarFileId != null)
        ? ref.read(clientTrainerApiProvider).avatarUrl(t!.avatarFileId!)
        : null;

    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(bottom: BorderSide(color: c.line)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
          child: Row(
            children: <Widget>[
              AuthedAvatar(
                url: avatarUrl,
                token: ref.watch(sessionProvider).token,
                initials: t?.initials ?? '',
                radius: 20,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                    if (title != null)
                      Text(title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: c.inkMuted)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
