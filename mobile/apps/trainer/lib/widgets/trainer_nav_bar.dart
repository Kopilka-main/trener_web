import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Нижнее меню тренера: Назад / Домой / Финансы / Календарь. Добавляется в
/// Scaffold.bottomNavigationBar на большинстве экранов (кроме календаря,
/// проведения тренировки и главной).
class TrainerNavBar extends StatelessWidget {
  const TrainerNavBar({super.key});

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      decoration: BoxDecoration(
        color: c.card,
        border: Border(top: BorderSide(color: c.line)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: <Widget>[
            _item(c, Icons.arrow_back, 'Назад', () {
              final NavigatorState nav = Navigator.of(context);
              if (nav.canPop()) {
                nav.pop();
              } else {
                context.go('/home');
              }
            }),
            _item(c, Icons.home_outlined, 'Домой', () => context.go('/home')),
            _item(c, Icons.account_balance_wallet_outlined, 'Финансы',
                () => context.go('/accounting')),
            _item(c, Icons.calendar_today_outlined, 'Календарь', () => context.go('/calendar')),
          ],
        ),
      ),
    );
  }

  Widget _item(AppColors c, IconData icon, String label, VoidCallback onTap) => Expanded(
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(icon, size: 22, color: c.inkMuted),
                const SizedBox(height: 2),
                Text(label, style: AppFonts.mono(size: 10, color: c.inkMuted, weight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      );
}
