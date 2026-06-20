import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_auth.dart';

/// Профиль и настройки клиента: данные аккаунта, код подключения, выход.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<ClientAccount> me = ref.watch(clientMeProvider);
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Профиль')),
      body: me.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: FilledButton(
            onPressed: () => ref.invalidate(clientMeProvider),
            child: const Text('Повторить'),
          ),
        ),
        data: (ClientAccount a) => ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            Row(
              children: <Widget>[
                CircleAvatar(
                  radius: 28,
                  backgroundColor: cs.primary.withValues(alpha: 0.18),
                  child: Icon(Icons.person, color: cs.primary, size: 26),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(a.fullName.isNotEmpty ? a.fullName : 'Аккаунт',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                      if (a.email.isNotEmpty) ...<Widget>[
                        const SizedBox(height: 4),
                        Text(a.email, style: TextStyle(color: cs.onSurfaceVariant)),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            _CodeCard(code: a.id),
            const SizedBox(height: 12),
            ListTile(
              leading: const Icon(Icons.person_add_alt),
              title: const Text('Подключиться к тренеру'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/connect'),
            ),
            const Divider(),
            ListTile(
              leading: Icon(Icons.logout, color: cs.error),
              title: Text('Выйти', style: TextStyle(color: cs.error)),
              onTap: () => _confirmLogout(context, ref),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Выйти из аккаунта?'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Выйти')),
        ],
      ),
    );
    if (ok == true) await ref.read(clientApiProvider).logout();
  }
}

/// Код подключения с кнопкой копирования.
class _CodeCard extends StatelessWidget {
  const _CodeCard({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Код подключения', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 4),
                SelectableText(code,
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 1.5)),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Скопировать',
            icon: const Icon(Icons.copy),
            onPressed: () async {
              final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
              await Clipboard.setData(ClipboardData(text: code));
              m.showSnackBar(const SnackBar(content: Text('Код скопирован')));
            },
          ),
        ],
      ),
    );
  }
}
