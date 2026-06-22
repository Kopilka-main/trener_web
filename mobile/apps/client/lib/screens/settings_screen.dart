import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api/client_auth.dart';
import '../api/client_trainer.dart';
import 'profile_edit_screen.dart';

/// Профиль клиента (зеркало web ProfilePage, режим просмотра): карточка клиента,
/// привязанный тренер, контакты, «о себе», тема, выход.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<ClientAccount> me = ref.watch(clientMeProvider);
    final AsyncValue<bool> linked = ref.watch(clientLinkedProvider);
    final AppColors c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: me.when(
          loading: () => _loading(c),
          error: (Object e, _) => Center(
            child: FilledButton(
              onPressed: () => ref.invalidate(clientMeProvider),
              child: const Text('Повторить'),
            ),
          ),
          data: (ClientAccount a) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
            children: <Widget>[
              // Заголовок + кнопка правки.
              Row(
                children: <Widget>[
                  Text('Профиль', style: AppFonts.display(size: 28, color: c.ink)),
                  const Spacer(),
                  _RoundIconButton(
                    icon: Icons.edit_outlined,
                    tooltip: 'Редактировать профиль',
                    onTap: () => Navigator.of(context).push<bool>(
                      MaterialPageRoute<bool>(builder: (_) => ProfileEditScreen(account: a)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              if (a.pendingDeletionAt != null) ...<Widget>[
                _DeletionBanner(
                  when: a.pendingDeletionAt!,
                  onCancel: () => _cancelAccountDeletion(context, ref),
                ),
                const SizedBox(height: 20),
              ],
              _ClientCard(account: a),
              const SizedBox(height: 20),
              _TrainerCard(linked: linked.valueOrNull ?? false),
              const SizedBox(height: 20),
              _ContactsSection(account: a),
              if (a.bio?.isNotEmpty == true) ...<Widget>[
                const SizedBox(height: 20),
                _SectionLabel('О себе / цели'),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                  child: Text(a.bio!, style: TextStyle(fontSize: 14, height: 1.5, color: c.ink)),
                ),
              ],
              const SizedBox(height: 20),
              _SectionLabel('Уведомления'),
              const SizedBox(height: 6),
              const _PushToggle(),
              const SizedBox(height: 6),
              const _SoundToggle(),
              const SizedBox(height: 20),
              _SectionLabel('Тема'),
              const SizedBox(height: 6),
              const _ThemeToggle(),
              const SizedBox(height: 20),
              _SectionLabel('ID пользователя'),
              const SizedBox(height: 6),
              _IdCard(id: a.id),
              const SizedBox(height: 24),
              _LogoutButton(onLogout: () => _confirmLogout(context, ref)),
              if (a.pendingDeletionAt == null) ...<Widget>[
                const SizedBox(height: 10),
                _DeleteAccountButton(onTap: () => _confirmDeleteAccount(context, ref)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _loading(AppColors c) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
        children: <Widget>[
          Text('Профиль', style: AppFonts.display(size: 28, color: c.ink)),
          const SizedBox(height: 20),
          Text('Загрузка…', style: TextStyle(fontSize: 14, color: c.inkMuted)),
        ],
      );

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Выйти из аккаунта?'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: context.colors.danger),
            child: const Text('Выйти'),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(clientApiProvider).logout();
  }
}

/// Карточка клиента: аватар 64, имя, email, дата рождения.
class _ClientCard extends ConsumerWidget {
  const _ClientCard({required this.account});
  final ClientAccount account;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final ClientApi api = ref.read(clientApiProvider);
    final String? birth = _isoToDisplay(account.birthDate);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(24)),
      child: Row(
        children: <Widget>[
          AuthedAvatar(
            url: account.avatarFileId != null ? api.avatarUrl(account.avatarFileId!) : null,
            token: ref.watch(sessionProvider).token,
            initials: account.initials,
            radius: 32,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  account.fullName.isNotEmpty ? account.fullName : 'Аккаунт',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, height: 1.1, color: c.ink),
                ),
                if (account.email.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 4),
                  Text(account.email,
                      style: TextStyle(fontSize: 12, color: c.inkMutedXl), overflow: TextOverflow.ellipsis),
                ],
                if (birth != null) ...<Widget>[
                  const SizedBox(height: 2),
                  Text('Дата рождения: $birth', style: TextStyle(fontSize: 12, color: c.inkMutedXl)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Карточка привязанного тренера → /trainer, либо CTA «Подключить тренера» → /connect.
class _TrainerCard extends ConsumerWidget {
  const _TrainerCard({required this.linked});
  final bool linked;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    if (!linked) {
      return InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/connect'),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
          child: Text('Подключить тренера',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.accent)),
        ),
      );
    }
    final TrainerPublic? t = ref.watch(clientTrainerProvider).valueOrNull;
    final ClientTrainerApi api = ref.read(clientTrainerApiProvider);
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => context.push('/trainer'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: <Widget>[
            AuthedAvatar(
              url: t?.avatarFileId != null ? api.avatarUrl(t!.avatarFileId!) : null,
              token: ref.watch(sessionProvider).token,
              initials: t?.initials ?? '',
              radius: 24,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('ВАШ ТРЕНЕР',
                      style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(
                    t != null ? (t.fullName.isNotEmpty ? t.fullName : 'Тренер') : 'Загрузка…',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (t?.title?.isNotEmpty == true) ...<Widget>[
                    const SizedBox(height: 1),
                    Text(t!.title!,
                        style: TextStyle(fontSize: 13, color: c.inkMuted), overflow: TextOverflow.ellipsis),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right, size: 20, color: c.inkMutedXl),
          ],
        ),
      ),
    );
  }
}

/// Контакты: строка Email (mailto) + контакты из account.contacts.
class _ContactsSection extends StatelessWidget {
  const _ContactsSection({required this.account});
  final ClientAccount account;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _SectionLabel('Контакты'),
        const SizedBox(height: 6),
        if (account.email.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(18)),
            child: Row(
              children: <Widget>[
                Icon(Icons.mail_outline, size: 16, color: c.inkMuted),
                const SizedBox(width: 12),
                Text('Email', style: TextStyle(fontSize: 13, color: c.inkMuted)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(account.email,
                      textAlign: TextAlign.right,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                ),
              ],
            ),
          ),
        ...account.contacts.map((ClientContact ct) => Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(18)),
              child: Row(
                children: <Widget>[
                  Text(ct.type, style: TextStyle(fontSize: 13, color: c.inkMuted)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(ct.value,
                        textAlign: TextAlign.right,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                  ),
                ],
              ),
            )),
      ],
    );
  }
}

/// Переключатель темы (web: две кнопки Светлая/Тёмная, активная — bg-accent).
class _ThemeToggle extends ConsumerWidget {
  const _ThemeToggle();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final ThemeMode mode = ref.watch(themeModeProvider);
    // В вебе тема бинарна; system трактуем как «не тёмная» → светлая активна.
    final bool isDark = mode == ThemeMode.dark;
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(18)),
      child: Row(
        children: <Widget>[
          _ThemeOption(
            label: 'Светлая',
            icon: Icons.light_mode_outlined,
            active: !isDark,
            onTap: () => ref.read(themeModeProvider.notifier).set(ThemeMode.light),
          ),
          const SizedBox(width: 8),
          _ThemeOption(
            label: 'Тёмная',
            icon: Icons.dark_mode_outlined,
            active: isDark,
            onTap: () => ref.read(themeModeProvider.notifier).set(ThemeMode.dark),
          ),
        ],
      ),
    );
  }
}

class _ThemeOption extends StatelessWidget {
  const _ThemeOption({required this.label, required this.icon, required this.active, required this.onTap});
  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            color: active ? c.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(icon, size: 16, color: active ? c.accentOn : c.inkMuted),
              const SizedBox(width: 8),
              Text(label,
                  style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w600, color: active ? c.accentOn : c.inkMuted)),
            ],
          ),
        ),
      ),
    );
  }
}

/// «Выйти» — нейтральная карточка (без красного текста; красный — только в подтверждении).
class _LogoutButton extends StatelessWidget {
  const _LogoutButton({required this.onLogout});
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onLogout,
      child: Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Text('Выйти', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
      ),
    );
  }
}

/// Кнопка «Удалить аккаунт» — реальное необратимое действие (допустим красный).
class _DeleteAccountButton extends StatelessWidget {
  const _DeleteAccountButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.delete_forever_outlined, size: 18, color: c.danger),
            const SizedBox(width: 8),
            Text('Удалить аккаунт',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.danger)),
          ],
        ),
      ),
    );
  }
}

/// Баннер «аккаунт запланирован к удалению» с кнопкой отмены (в течение окна).
class _DeletionBanner extends StatelessWidget {
  const _DeletionBanner({required this.when, required this.onCancel});
  final String when; // ISO-момент сноса
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final DateTime? d = DateTime.tryParse(when)?.toLocal();
    final String date = d == null
        ? ''
        : '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.danger),
      ),
      child: Row(
        children: <Widget>[
          Icon(Icons.warning_amber_rounded, color: c.danger, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Аккаунт будет удалён',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.ink)),
                Text('$date · можно отменить', style: AppFonts.mono(size: 12, color: c.inkMuted)),
              ],
            ),
          ),
          TextButton(onPressed: onCancel, child: const Text('Отменить')),
        ],
      ),
    );
  }
}

/// Запросить удаление аккаунта (окно отмены 3 дня) — подтверждение + планирование.
Future<void> _confirmDeleteAccount(BuildContext context, WidgetRef ref) async {
  final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
  final bool ok = await confirmDelete(
    context,
    title: 'Удалить аккаунт?',
    message:
        'Аккаунт и все ваши данные будут удалены через 3 дня. В течение этого срока удаление можно отменить.',
  );
  if (!ok) return;
  try {
    await ref.read(clientApiProvider).deleteAccount();
    ref.invalidate(clientMeProvider);
    m.showSnackBar(
        const SnackBar(content: Text('Удаление запланировано. Можно отменить в течение 3 дней.')));
  } catch (_) {
    m.showSnackBar(const SnackBar(content: Text('Не удалось запланировать удаление')));
  }
}

/// Отменить запланированное удаление аккаунта.
Future<void> _cancelAccountDeletion(BuildContext context, WidgetRef ref) async {
  final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
  try {
    await ref.read(clientApiProvider).cancelDeletion();
    ref.invalidate(clientMeProvider);
    m.showSnackBar(const SnackBar(content: Text('Удаление отменено')));
  } catch (_) {
    m.showSnackBar(const SnackBar(content: Text('Не удалось отменить')));
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(text,
      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: context.colors.inkMuted));
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

  // Долгое нажатие по строке — диагностика доставки пушей (видно, где обрыв).
  Future<void> _showDiagnostics() async {
    final NavigatorState nav = Navigator.of(context);
    showDialog<void>(
      context: context,
      builder: (_) => const AlertDialog(
        content: SizedBox(height: 48, child: Center(child: CircularProgressIndicator())),
      ),
    );
    final String report = await ref.read(pushServiceProvider).diagnose();
    nav.pop();
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Диагностика пушей'),
        content: SelectableText(report, style: const TextStyle(fontSize: 13, height: 1.5)),
        actions: <Widget>[
          TextButton(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: report));
              Navigator.of(context).pop();
            },
            child: const Text('Копировать'),
          ),
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Закрыть')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onLongPress: _showDiagnostics,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: <Widget>[
            Icon(Icons.notifications_outlined, size: 22, color: c.ink),
            const SizedBox(width: 12),
            Expanded(child: Text('Push-уведомления', style: TextStyle(fontSize: 15, color: c.ink))),
            if (_busy)
              const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
            else
              Switch(value: _enabled, onChanged: _onChanged),
          ],
        ),
      ),
    );
  }
}

/// Тумблер звука при проведении тренировки (бип таймера отдыха). Хранится
/// локально через [workoutSoundEnabledProvider].
class _SoundToggle extends ConsumerWidget {
  const _SoundToggle();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final bool on = ref.watch(workoutSoundEnabledProvider);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Row(
        children: <Widget>[
          Icon(Icons.volume_up_outlined, size: 22, color: c.ink),
          const SizedBox(width: 12),
          Expanded(child: Text('Звук при тренировке', style: TextStyle(fontSize: 15, color: c.ink))),
          Switch(
            value: on,
            onChanged: (bool v) => ref.read(workoutSoundEnabledProvider.notifier).setEnabled(v),
          ),
        ],
      ),
    );
  }
}

/// Карточка ID пользователя: копировать + показать QR.
class _IdCard extends StatelessWidget {
  const _IdCard({required this.id});
  final String id;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Text(id,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppFonts.mono(size: 13, color: c.ink, weight: FontWeight.w600)),
              ),
              GestureDetector(
                onTap: () {
                  Clipboard.setData(ClipboardData(text: id));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Скопировано')));
                },
                child: Icon(Icons.copy, size: 18, color: c.inkMuted),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => _showQr(context, id),
          icon: const Icon(Icons.qr_code_2, size: 18),
          label: const Text('Показать QR'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
        ),
      ],
    );
  }
}

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

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({required this.icon, required this.onTap, this.tooltip});
  final IconData icon;
  final VoidCallback onTap;
  final String? tooltip;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return IconButton(
      onPressed: onTap,
      tooltip: tooltip,
      icon: Icon(icon, size: 20, color: c.ink),
    );
  }
}

/// ISO YYYY-MM-DD → ДД.ММ.ГГГГ (null/некорректный → null).
String? _isoToDisplay(String? iso) {
  if (iso == null) return null;
  final RegExpMatch? m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso);
  return m == null ? null : '${m.group(3)}.${m.group(2)}.${m.group(1)}';
}
