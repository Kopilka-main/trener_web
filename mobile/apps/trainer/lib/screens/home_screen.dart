import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_home.dart';

String _pad2(int n) => n.toString().padLeft(2, '0');

/// Прибыль за месяц коротко: тысячи → «12к», иначе число.
String _profit(num v) {
  final int n = v.round();
  if (n.abs() >= 1000) return '${n < 0 ? '−' : ''}${(n.abs() / 1000).toStringAsFixed(n.abs() >= 10000 ? 0 : 1)}к';
  return '$n';
}

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<HomeData> home = ref.watch(trainerHomeProvider);
    final AppColors c = context.colors;
    return Scaffold(
      body: SafeArea(
        child: home.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (Object e, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Text('Не удалось загрузить главную'),
                const SizedBox(height: 12),
                FilledButton(
                    onPressed: () => ref.invalidate(trainerHomeProvider),
                    child: const Text('Повторить')),
              ],
            ),
          ),
          data: (HomeData d) => RefreshIndicator(
            onRefresh: () async => ref.invalidate(trainerHomeProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(d.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                    ),
                    IconButton(
                      onPressed: () => context.push('/settings'),
                      icon: Icon(Icons.settings_outlined, size: 28, color: c.inkMuted),
                      tooltip: 'Профиль',
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 4, 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: <Widget>[
                      Text(_pad2(d.todaySessions),
                          style: AppFonts.display(size: 64, color: c.accent, letterSpacing: -2)),
                      const SizedBox(width: 12),
                      Flexible(
                        child: Text('тренировок\nсегодня',
                            style: TextStyle(
                                fontSize: 22,
                                height: 1.1,
                                fontWeight: FontWeight.bold,
                                color: c.ink)),
                      ),
                    ],
                  ),
                ),
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1.15,
                  children: <Widget>[
                    _Tile(
                      title: 'Клиенты',
                      sub: 'активные',
                      value: _pad2(d.activeClients),
                      metric: 'активных',
                      icon: Icons.group_outlined,
                      onTap: () => context.push('/clients'),
                    ),
                    _Tile(
                      title: 'Календарь',
                      sub: 'расписание',
                      value: _pad2(d.plannedSessions),
                      metric: 'на 30 дней',
                      icon: Icons.calendar_today,
                      onTap: () => context.push('/calendar'),
                    ),
                    _Tile(
                      title: 'Чат',
                      sub: 'клиенты на связи',
                      value: _pad2(d.unread),
                      metric: 'новых',
                      icon: Icons.chat_bubble_outline,
                      primary: d.unread > 0,
                      onTap: () => context.push('/chats'),
                    ),
                    _Tile(
                      title: 'Уведомления',
                      sub: 'что требует внимания',
                      value: _pad2(d.alerts),
                      metric: 'алертов',
                      icon: Icons.notifications_none,
                      primary: d.alerts > 0,
                      onTap: () => context.push('/notifications'),
                    ),
                    _Tile(
                      title: 'Финансы',
                      sub: 'прибыль за месяц',
                      value: _profit(d.monthlyProfit),
                      metric: 'за месяц',
                      icon: Icons.account_balance_wallet_outlined,
                      onTap: () => context.push('/accounting'),
                    ),
                    _Tile(
                      title: 'База знаний',
                      sub: 'упражнения и шаблоны',
                      value: _pad2(d.knowledgeCount),
                      metric: 'упражнений',
                      icon: Icons.menu_book_outlined,
                      onTap: () => context.push('/knowledge'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Плитка дашборда в стиле веба.
class _Tile extends StatelessWidget {
  const _Tile({
    required this.title,
    required this.sub,
    required this.value,
    required this.metric,
    required this.icon,
    required this.onTap,
    this.primary = false,
  });
  final String title;
  final String sub;
  final String value;
  final String metric;
  final IconData icon;
  final VoidCallback onTap;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final Color bg = primary ? c.accent : c.card;
    final Color fg = primary ? c.accentOn : c.ink;
    final Color sub2 = primary ? c.accentOn.withValues(alpha: 0.65) : c.inkMutedXl;
    final Color metricColor = primary ? c.accentOn.withValues(alpha: 0.7) : c.inkMuted;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(18),
          border: primary ? null : Border.all(color: c.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(icon, size: 20, color: fg),
                const Spacer(),
                Icon(Icons.north_east,
                    size: 14, color: primary ? c.accentOn.withValues(alpha: 0.7) : c.inkMutedXl),
              ],
            ),
            const Spacer(),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: <Widget>[
                Text(value, style: AppFonts.display(size: 34, color: fg, letterSpacing: -1)),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(metric.toUpperCase(),
                      maxLines: 2,
                      style: AppFonts.mono(size: 10, color: metricColor, weight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: fg)),
            Text(sub,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: sub2)),
          ],
        ),
      ),
    );
  }
}
