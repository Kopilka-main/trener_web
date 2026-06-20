import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_home.dart';

const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

String _formatRuDate(String iso) {
  final List<String> p = iso.substring(0, 10).split('-');
  if (p.length != 3) return iso;
  final int m = int.tryParse(p[1]) ?? 1;
  return '${int.tryParse(p[2]) ?? p[2]} ${_ruMonths[(m - 1).clamp(0, 11)]} ${p[0]}';
}

String _pad2(int n) => n.toString().padLeft(2, '0');

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<HomeData> home = ref.watch(clientHomeProvider);
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
                    onPressed: () => ref.invalidate(clientHomeProvider),
                    child: const Text('Повторить')),
              ],
            ),
          ),
          data: (HomeData d) => RefreshIndicator(
            onRefresh: () async => ref.invalidate(clientHomeProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
              children: <Widget>[
                // Шапка: имя + шестерёнка.
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
                // Hero: счётчик оплаченных тренировок.
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: <Widget>[
                          Text(
                            d.paidBalance < 0 ? '${d.paidBalance}' : _pad2(d.paidBalance),
                            style: AppFonts.display(
                                size: 64,
                                color: d.paidBalance < 0 ? c.danger : c.accent,
                                letterSpacing: -2),
                          ),
                          const SizedBox(width: 12),
                          Flexible(
                            child: Text('количество\nтренировок',
                                style: TextStyle(
                                    fontSize: 22,
                                    height: 1.1,
                                    fontWeight: FontWeight.bold,
                                    color: c.ink)),
                          ),
                        ],
                      ),
                      if (d.packageEndsAt != null) ...<Widget>[
                        const SizedBox(height: 6),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: <Widget>[
                            Icon(Icons.local_fire_department, size: 15, color: c.accent),
                            const SizedBox(width: 5),
                            Text('до ${_formatRuDate(d.packageEndsAt!)}',
                                style: TextStyle(
                                    fontSize: 13, fontWeight: FontWeight.w600, color: c.inkMuted)),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                // Сетка плиток 2×3.
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1.15,
                  children: <Widget>[
                    _Tile(
                      title: 'Тренировки',
                      sub: 'журнал занятий',
                      value: _pad2(d.completedWorkouts),
                      metric: 'завершено',
                      icon: Icons.fitness_center,
                      onTap: () => context.push('/workouts'),
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
                      sub: 'тренер на связи',
                      value: _pad2(d.unread),
                      metric: 'новых',
                      icon: Icons.chat_bubble_outline,
                      primary: d.unread > 0,
                      onTap: () => context.push('/chat'),
                    ),
                    _Tile(
                      title: 'Прогресс',
                      sub: 'рекорды и цифры',
                      value: _pad2(d.completedWorkouts),
                      metric: 'тренировок',
                      icon: Icons.trending_up,
                      onTap: () => context.push('/progress'),
                    ),
                    _Tile(
                      title: 'База знаний',
                      sub: 'упражнения',
                      value: '↗',
                      metric: 'открыть',
                      icon: Icons.menu_book_outlined,
                      onTap: () => context.push('/knowledge'),
                    ),
                    _Tile(
                      title: 'Уведомления',
                      sub: 'что нового',
                      value: '↗',
                      metric: 'открыть',
                      icon: Icons.notifications_none,
                      onTap: () => context.push('/notifications'),
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

/// Плитка дашборда в стиле веба: иконка ↖, стрелка ↗, крупное число (display) +
/// mono-метка, заголовок, подпись. primary → акцентная заливка.
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
                Icon(Icons.north_east, size: 14, color: primary ? c.accentOn.withValues(alpha: 0.7) : c.inkMutedXl),
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
