import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_auth.dart';
import '../api/client_trainer.dart';

/// Профиль тренера глазами клиента: аватар, имя, специализация, о себе,
/// контакты и отключение. Зеркало веб-клиент TrainerPage.
class TrainerScreen extends ConsumerWidget {
  const TrainerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<TrainerPublic?> trainer = ref.watch(clientTrainerProvider);
    final String? token = ref.watch(sessionProvider).token;
    final ClientTrainerApi api = ref.read(clientTrainerApiProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Тренер')),
      body: trainer.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: FilledButton(
              onPressed: () => ref.invalidate(clientTrainerProvider), child: const Text('Повторить')),
        ),
        data: (TrainerPublic? t) {
          if (t == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Вы пока не подключены к тренеру.',
                    textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: <Widget>[
              Center(
                child: Column(
                  children: <Widget>[
                    AuthedAvatar(
                      url: t.avatarFileId != null ? api.avatarUrl(t.avatarFileId!) : null,
                      token: token,
                      initials: t.initials,
                      radius: 48,
                    ),
                    const SizedBox(height: 12),
                    Text(t.fullName.isNotEmpty ? t.fullName : 'Тренер',
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: c.ink)),
                    if (t.title?.isNotEmpty == true) ...<Widget>[
                      const SizedBox(height: 4),
                      Text(t.title!, style: TextStyle(fontSize: 14, color: c.accent, fontWeight: FontWeight.w600)),
                    ],
                  ],
                ),
              ),
              if (t.bio?.isNotEmpty == true) ...<Widget>[
                const SizedBox(height: 20),
                Text('О ТРЕНЕРЕ', style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(t.bio!, style: TextStyle(fontSize: 14, height: 1.45, color: c.ink)),
              ],
              if (t.contacts.isNotEmpty) ...<Widget>[
                const SizedBox(height: 20),
                Text('КОНТАКТЫ', style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
                const SizedBox(height: 8),
                ...t.contacts.map((ClientContact ct) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Row(
                        children: <Widget>[
                          SizedBox(
                            width: 110,
                            child: Text(ct.type, style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
                          ),
                          Expanded(child: Text(ct.value, style: TextStyle(fontSize: 14, color: c.ink))),
                        ],
                      ),
                    )),
              ],
              const SizedBox(height: 28),
              OutlinedButton.icon(
                onPressed: () => _confirmDisconnect(context, ref),
                icon: Icon(Icons.link_off, size: 18, color: c.danger),
                label: Text('Отключиться от тренера', style: TextStyle(color: c.danger)),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  side: BorderSide(color: c.line),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _confirmDisconnect(BuildContext context, WidgetRef ref) async {
    final NavigatorState nav = Navigator.of(context);
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Отключиться от тренера?'),
        content: const Text('Связь будет разорвана. Подключиться снова можно по коду.'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: context.colors.danger),
            child: const Text('Отключиться'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(clientTrainerApiProvider).disconnect();
      ref.invalidate(clientTrainerProvider);
      ref.invalidate(clientLinkedProvider);
      if (nav.canPop()) nav.pop();
    } catch (_) {}
  }
}
