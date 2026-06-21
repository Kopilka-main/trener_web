import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api/trainer_auth.dart';
import '../api/trainer_gyms.dart';
import 'profile_edit_screen.dart';

/// Заголовок секции (mono uppercase) — как в вебе.
class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Text(text.toUpperCase(),
            style: AppFonts.mono(size: 11, color: context.colors.inkMutedXl, weight: FontWeight.w700)),
      );
}

/// Строка контакта: иконка + тип + значение.
class _ContactRow extends StatelessWidget {
  const _ContactRow({required this.icon, required this.type, required this.value});
  final IconData icon;
  final String type;
  final String value;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    if (value.trim().isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: <Widget>[
          Icon(icon, size: 18, color: c.inkMuted),
          const SizedBox(width: 12),
          Text(type, style: TextStyle(fontSize: 14, color: c.inkMuted)),
          const Spacer(),
          Flexible(
            child: Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
          ),
        ],
      ),
    );
  }
}

/// Показать QR с ID пользователя.
void _showQr(BuildContext context, String id) {
  final AppColors c = context.colors;
  showDialog<void>(
    context: context,
    builder: (BuildContext ctx) => Dialog(
      backgroundColor: c.bg,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              padding: const EdgeInsets.all(12),
              color: Colors.white,
              child: QrImageView(data: id, size: 220, backgroundColor: Colors.white),
            ),
            const SizedBox(height: 12),
            Text(id, textAlign: TextAlign.center, style: AppFonts.mono(size: 12, color: c.inkMuted)),
          ],
        ),
      ),
    ),
  );
}

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
            const SizedBox(height: 16),
            const Divider(),
            const _GymsSection(),
            const Divider(),
            // ── КОНТАКТЫ ──
            _SectionLabel('Контакты'),
            _ContactRow(icon: Icons.mail_outline, type: 'Email', value: a.email),
            ...a.contacts.map((TrainerContact ct) => _ContactRow(icon: Icons.alternate_email, type: ct.type, value: ct.value)),
            const SizedBox(height: 8),
            const Divider(),
            const _PushToggle(),
            const Divider(),
            const _ThemeSwitch(),
            const Divider(),
            // ── ID ПОЛЬЗОВАТЕЛЯ ──
            _SectionLabel('ID пользователя'),
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Text(a.id,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppFonts.mono(size: 13, color: c.ink, weight: FontWeight.w600)),
                  ),
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: a.id));
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Скопировано')));
                    },
                    child: Icon(Icons.copy, size: 18, color: c.inkMuted),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OutlinedButton.icon(
                onPressed: () => _showQr(context, a.id),
                icon: const Icon(Icons.qr_code_2, size: 18),
                label: const Text('Показать QR'),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              ),
            ),
            const SizedBox(height: 8),
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

/// Тумблер push-уведомлений: запрашивает разрешение и регистрирует токен.
class _PushToggle extends ConsumerStatefulWidget {
  const _PushToggle();
  @override
  ConsumerState<_PushToggle> createState() => _PushToggleState();
}

class _PushToggleState extends ConsumerState<_PushToggle> {
  bool _enabled = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final bool on = await ref.read(pushServiceProvider).isEnabled();
    if (mounted) setState(() => _enabled = on);
  }

  Future<void> _onChanged(bool v) async {
    if (_busy) return;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    if (!v) {
      // Android не даёт отозвать разрешение из приложения.
      m.showSnackBar(const SnackBar(content: Text('Отключить уведомления можно в настройках телефона')));
      return;
    }
    setState(() => _busy = true);
    final bool ok = await ref.read(pushServiceProvider).enable();
    if (!mounted) return;
    setState(() {
      _enabled = ok;
      _busy = false;
    });
    if (!ok) {
      m.showSnackBar(const SnackBar(content: Text('Разрешите уведомления в настройках телефона')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('УВЕДОМЛЕНИЯ', style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
          const SizedBox(height: 4),
          Row(
            children: <Widget>[
              const Icon(Icons.notifications_outlined, size: 22),
              const SizedBox(width: 12),
              const Expanded(child: Text('Push-уведомления', style: TextStyle(fontSize: 16))),
              if (_busy)
                const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              else
                Switch(value: _enabled, onChanged: _onChanged),
            ],
          ),
        ],
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
