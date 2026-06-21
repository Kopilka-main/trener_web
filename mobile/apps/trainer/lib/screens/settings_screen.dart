import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_auth.dart';
import '../api/trainer_gyms.dart';
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
                AuthedAvatar(
                  url: a.avatarFileId != null ? ref.read(trainerApiProvider).fileUrl(a.avatarFileId!) : null,
                  token: ref.watch(sessionProvider).token,
                  initials: a.initials,
                  radius: 28,
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
            const _GymsSection(),
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

/// Управление залами: список, добавление, удаление.
class _GymsSection extends ConsumerStatefulWidget {
  const _GymsSection();
  @override
  ConsumerState<_GymsSection> createState() => _GymsSectionState();
}

class _GymsSectionState extends ConsumerState<_GymsSection> {
  bool _adding = false;
  final TextEditingController _name = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final String name = _name.text.trim();
    if (name.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(trainerGymsApiProvider).create(name: name);
      ref.invalidate(trainerGymsProvider);
      if (!mounted) return;
      setState(() {
        _name.clear();
        _adding = false;
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
    }
  }

  Future<void> _delete(String id) async {
    try {
      await ref.read(trainerGymsApiProvider).delete(id);
      ref.invalidate(trainerGymsProvider);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<Gym> gyms = ref.watch(trainerGymsProvider).valueOrNull ?? <Gym>[];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              const Icon(Icons.fitness_center, size: 20),
              const SizedBox(width: 12),
              Text('Залы', style: const TextStyle(fontSize: 16)),
              const Spacer(),
              TextButton.icon(
                onPressed: () => setState(() => _adding = !_adding),
                icon: Icon(_adding ? Icons.close : Icons.add, size: 16),
                label: Text(_adding ? 'Отмена' : 'Добавить'),
              ),
            ],
          ),
          if (_adding) ...<Widget>[
            const SizedBox(height: 8),
            Row(
              children: <Widget>[
                Expanded(
                  child: TextField(
                    controller: _name,
                    autofocus: true,
                    onSubmitted: (_) => _add(),
                    decoration: InputDecoration(
                      hintText: 'Название зала',
                      isDense: true,
                      filled: true,
                      fillColor: c.card,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(onPressed: _busy ? null : _add, child: const Text('Готово')),
              ],
            ),
          ],
          const SizedBox(height: 8),
          if (gyms.isEmpty)
            Text('Залов нет', style: TextStyle(fontSize: 13, color: c.inkMuted))
          else
            ...gyms.map((Gym g) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
                  child: Row(
                    children: <Widget>[
                      Expanded(child: Text(g.name, style: TextStyle(fontSize: 14, color: c.ink))),
                      GestureDetector(
                        onTap: () => _delete(g.id),
                        child: Icon(Icons.delete_outline, size: 18, color: c.inkMuted),
                      ),
                    ],
                  ),
                )),
        ],
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
