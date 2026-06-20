import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_auth.dart';

/// Профиль и настройки тренера: данные аккаунта и выход.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<TrainerProfile> me = ref.watch(trainerMeProvider);
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Профиль')),
      body: me.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: FilledButton(
            onPressed: () => ref.invalidate(trainerMeProvider),
            child: const Text('Повторить'),
          ),
        ),
        data: (TrainerProfile a) => ListView(
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
    if (ok == true) await ref.read(trainerApiProvider).logout();
  }
}
