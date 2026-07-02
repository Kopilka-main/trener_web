import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client_auth.dart';

/// Гейт обязательного дня рождения: если пользователь авторизован, но день
/// рождения не указан — поверх всего приложения показываем обязательный экран
/// ввода (день+месяц, без года). Ставится в MaterialApp.builder.
class BirthdayGate extends ConsumerWidget {
  const BirthdayGate({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(sessionProvider).status != AuthStatus.authenticated) return child;
    final ClientAccount? me = ref.watch(clientMeProvider).valueOrNull;
    if (me == null || me.birthDate != null) return child;
    // Гейт живёт в MaterialApp.builder — ВЫШЕ роутерного Navigator, а _BirthdaySetup
    // открывает пикер через showModalBottomSheet, которому нужен Navigator-предок.
    // Без собственного Navigator тап по полю выбора «ничего не делает».
    return Navigator(
      onGenerateRoute: (RouteSettings settings) =>
          MaterialPageRoute<void>(builder: (_) => const _BirthdaySetup()),
    );
  }
}

class _BirthdaySetup extends ConsumerStatefulWidget {
  const _BirthdaySetup();
  @override
  ConsumerState<_BirthdaySetup> createState() => _BirthdaySetupState();
}

class _BirthdaySetupState extends ConsumerState<_BirthdaySetup> {
  String? _iso;
  bool _busy = false;

  Future<void> _save() async {
    if (_iso == null || _busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      await ref.read(clientApiProvider).updateProfile(<String, dynamic>{'birthDate': _iso});
      ref.invalidate(clientMeProvider);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Icon(Icons.cake_outlined, size: 40, color: c.accent),
              const SizedBox(height: 16),
              Text('Укажите день рождения', style: AppFonts.display(size: 26, color: c.ink)),
              const SizedBox(height: 8),
              Text('День и месяц — чтобы тренер мог поздравить вас. Год указывать не нужно.',
                  style: TextStyle(fontSize: 14, color: c.inkMuted, height: 1.4)),
              const SizedBox(height: 24),
              GestureDetector(
                onTap: () async {
                  final ({int day, int month})? cur = dayMonthFromIso(_iso);
                  final ({int day, int month})? r =
                      await pickDayMonth(context, day: cur?.day, month: cur?.month);
                  if (r != null) setState(() => _iso = dayMonthToIso(r.day, r.month));
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  decoration: BoxDecoration(
                    color: c.card,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: c.line),
                  ),
                  child: Row(
                    children: <Widget>[
                      Icon(Icons.event, size: 18, color: c.inkMuted),
                      const SizedBox(width: 10),
                      Text(formatDayMonth(_iso).isEmpty ? 'Выбрать день и месяц' : formatDayMonth(_iso),
                          style: TextStyle(fontSize: 15, color: _iso != null ? c.ink : c.inkMuted)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: (_iso == null || _busy) ? null : _save,
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                child: _busy
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Сохранить'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
