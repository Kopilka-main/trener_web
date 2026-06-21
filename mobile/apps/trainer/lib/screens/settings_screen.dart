import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_auth.dart';
import 'profile_edit_screen.dart';

/// Профиль и настройки тренера: данные аккаунта, редактирование, тема и выход.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<TrainerProfile> me = ref.watch(trainerMeProvider);
    final ColorScheme cs = Theme.of(context).colorScheme;
    final AppColors c = context.colors;
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
                      if (a.title?.isNotEmpty == true) ...<Widget>[
                        const SizedBox(height: 2),
                        Text(a.title!, style: TextStyle(fontSize: 13, color: c.accent, fontWeight: FontWeight.w600)),
                      ],
                      if (a.email.isNotEmpty) ...<Widget>[
                        const SizedBox(height: 4),
                        Text(a.email, style: TextStyle(color: cs.onSurfaceVariant)),
                      ],
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () async {
                    await Navigator.of(context).push<bool>(
                      MaterialPageRoute<bool>(builder: (_) => ProfileEditScreen(profile: a)),
                    );
                  },
                  icon: Icon(Icons.edit_outlined, size: 22, color: c.inkMuted),
                  tooltip: 'Редактировать',
                ),
              ],
            ),
            if (a.bio?.isNotEmpty == true) ...<Widget>[
              const SizedBox(height: 14),
              Text(a.bio!, style: TextStyle(fontSize: 14, height: 1.4, color: c.ink)),
            ],
            if (a.contacts.isNotEmpty) ...<Widget>[
              const SizedBox(height: 14),
              ...a.contacts.map((TrainerContact ct) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: <Widget>[
                        SizedBox(
                          width: 100,
                          child: Text(ct.type, style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
                        ),
                        Expanded(child: Text(ct.value, style: TextStyle(fontSize: 14, color: c.ink))),
                      ],
                    ),
                  )),
            ],
            const SizedBox(height: 16),
            const Divider(),
            const _ThemeSwitch(),
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
}

/// Переключатель темы: Система / Светлая / Тёмная.
class _ThemeSwitch extends ConsumerWidget {
  const _ThemeSwitch();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeMode mode = ref.watch(themeModeProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: const <Widget>[
              Icon(Icons.brightness_6_outlined, size: 22),
              SizedBox(width: 12),
              Text('Тема', style: TextStyle(fontSize: 16)),
            ],
          ),
          const SizedBox(height: 10),
          SegmentedButton<ThemeMode>(
            segments: const <ButtonSegment<ThemeMode>>[
              ButtonSegment<ThemeMode>(value: ThemeMode.system, label: Text('Система')),
              ButtonSegment<ThemeMode>(value: ThemeMode.light, label: Text('Светлая')),
              ButtonSegment<ThemeMode>(value: ThemeMode.dark, label: Text('Тёмная')),
            ],
            selected: <ThemeMode>{mode},
            onSelectionChanged: (Set<ThemeMode> s) =>
                ref.read(themeModeProvider.notifier).set(s.first),
          ),
        ],
      ),
    );
  }
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
