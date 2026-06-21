import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_auth.dart';
import '../api/client_home.dart';
import '../api/client_trainer.dart';
import '../widgets/auth_form.dart';

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
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
              child: Text('Тренер не подключён.', style: TextStyle(fontSize: 14, color: c.inkMuted)),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: <Widget>[
              // Подробная карточка тренера: аватар, имя, специализация, «ВАШ ТРЕНЕР».
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(24)),
                child: Row(
                  children: <Widget>[
                    AuthedAvatar(
                      url: t.avatarFileId != null ? api.avatarUrl(t.avatarFileId!) : null,
                      token: token,
                      initials: t.initials,
                      radius: 36,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Text('ВАШ ТРЕНЕР',
                              style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w600)),
                          const SizedBox(height: 4),
                          Text(t.fullName.isNotEmpty ? t.fullName : 'Тренер',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, height: 1.1, color: c.ink)),
                          if (t.title?.isNotEmpty == true) ...<Widget>[
                            const SizedBox(height: 3),
                            Text(t.title!,
                                style: TextStyle(fontSize: 14, color: c.accent, fontWeight: FontWeight.w600)),
                          ],
                        ],
                      ),
                    ),
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
                Container(
                  decoration: BoxDecoration(
                    color: c.card,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: <Widget>[
                      for (int i = 0; i < t.contacts.length; i++) ...<Widget>[
                        if (i > 0) Divider(height: 1, thickness: 1, color: c.line),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          child: Row(
                            children: <Widget>[
                              Text(t.contacts[i].type, style: TextStyle(fontSize: 14, color: c.inkMuted)),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(t.contacts[i].value,
                                    textAlign: TextAlign.right,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 14, color: c.ink)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 28),
              _DisconnectSection(trainerName: t.fullName),
            ],
          );
        },
      ),
    );
  }
}

/// Отключение от тренера: сворачиваемый блок. В раскрытом виде — пояснение
/// (данные клиента сохраняются) + ввод имени тренера; кнопка «Отключиться»
/// активна только при точном совпадении имени (без учёта регистра).
class _DisconnectSection extends ConsumerStatefulWidget {
  const _DisconnectSection({required this.trainerName});
  final String trainerName;

  @override
  ConsumerState<_DisconnectSection> createState() => _DisconnectSectionState();
}

class _DisconnectSectionState extends ConsumerState<_DisconnectSection> {
  final TextEditingController _name = TextEditingController();
  bool _open = false;
  bool _pending = false;
  bool _error = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _matches =>
      _name.text.trim().toLowerCase() == widget.trainerName.toLowerCase();

  void _cancel() {
    setState(() {
      _open = false;
      _error = false;
      _name.clear();
    });
  }

  Future<void> _disconnect() async {
    if (!_matches || _pending) return;
    setState(() {
      _pending = true;
      _error = false;
    });
    final NavigatorState nav = Navigator.of(context);
    try {
      await ref.read(clientTrainerApiProvider).disconnect();
      // Освежаем ВСЕ срезы, завязанные на привязку, иначе главная (агрегат) и
      // настройки продолжают показывать тренера/баланс, будто отключения не было.
      ref.invalidate(clientTrainerProvider);
      ref.invalidate(clientLinkedProvider);
      ref.invalidate(clientMeProvider);
      ref.invalidate(clientHomeProvider);
      if (nav.canPop()) nav.pop();
    } catch (_) {
      if (mounted) {
        setState(() {
          _pending = false;
          _error = true;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;

    if (!_open) {
      // Свёрнут: нейтральная кнопка (без красного текста).
      return TextButton(
        style: TextButton.styleFrom(
          backgroundColor: c.card,
          foregroundColor: c.ink,
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        onPressed: () => setState(() => _open = true),
        child: const Text('Отключиться от тренера'),
      );
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text.rich(
            TextSpan(
              style: TextStyle(fontSize: 13, height: 1.45, color: c.inkMuted),
              children: <InlineSpan>[
                const TextSpan(
                    text:
                        'Связь с тренером будет разорвана. Ваши тренировки, замеры и история сохранятся. Чтобы подтвердить, введите имя тренера: '),
                TextSpan(
                    text: widget.trainerName,
                    style: TextStyle(fontWeight: FontWeight.w600, color: c.ink)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          AuthField(
            controller: _name,
            label: 'Имя тренера',
            onChanged: (_) => setState(() {}),
          ),
          if (_error) ...<Widget>[
            const SizedBox(height: 8),
            Text('Не удалось отключиться. Попробуйте снова.',
                style: TextStyle(fontSize: 13, color: c.inkMuted)),
          ],
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: TextButton(
                  style: TextButton.styleFrom(
                    backgroundColor: c.cardElevated,
                    foregroundColor: c.ink,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  onPressed: _pending ? null : _cancel,
                  child: const Text('Отмена'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: c.danger,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: c.danger.withValues(alpha: 0.4),
                    disabledForegroundColor: Colors.white.withValues(alpha: 0.9),
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  onPressed: (_matches && !_pending) ? _disconnect : null,
                  child: Text(_pending ? 'Отключение…' : 'Отключиться'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
