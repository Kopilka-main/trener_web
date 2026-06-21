import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_home.dart';

String _pad2(int n) => n.toString().padLeft(2, '0');

/// Прибыль за месяц в тысячах: «12», «−3».
String _thousands(num v) {
  final int n = (v / 1000).round();
  return '${n < 0 ? '−' : ''}${n.abs()}';
}

const List<String> _dayShort = <String>['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const List<String> _monthGen = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

String _dateKicker(DateTime n) =>
    'СЕГОДНЯ · ${_dayShort[n.weekday - 1]} ${n.day} ${_monthGen[n.month - 1].toUpperCase()}';

/// Короткий обратный отсчёт до занятия: «2Д», «3Ч 10М», «45М», «СЕЙЧАС».
String _diffShort(DateTime future, DateTime now) {
  final int ms = future.difference(now).inMilliseconds;
  if (ms <= 0) return 'СЕЙЧАС';
  final int totalMin = (ms / 60000).round();
  final int totalH = totalMin ~/ 60;
  if (totalH >= 24) {
    final int d = totalH ~/ 24;
    final int h = totalH % 24;
    return h == 0 ? '$d' 'Д' : '$d' 'Д ' '$h' 'Ч';
  }
  final int m = totalMin % 60;
  if (totalH == 0) return '$m' 'М';
  if (m == 0) return '$totalH' 'Ч';
  return '$totalH' 'Ч ' '$m' 'М';
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
          data: (HomeData d) {
            final bool alertsPrimary = d.alerts > 0;
            final bool msgPrimary = !alertsPrimary && d.unread > 0;
            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(trainerHomeProvider),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
                children: <Widget>[
                  // Дата-кикер + шестерёнка.
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: Text(_dateKicker(DateTime.now()),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
                      ),
                      IconButton(
                        onPressed: () => context.push('/settings'),
                        icon: Icon(Icons.settings_outlined, size: 28, color: c.inkMuted),
                        tooltip: 'Профиль',
                      ),
                    ],
                  ),
                  // Герой: число «тренировок сегодня» → календарь.
                  GestureDetector(
                    onTap: () => context.push('/calendar'),
                    behavior: HitTestBehavior.opaque,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(4, 2, 4, 6),
                      child: Row(
                        children: <Widget>[
                          Text(_pad2(d.todaySessions),
                              style: AppFonts.display(size: 64, color: c.accent, letterSpacing: -2)),
                          const SizedBox(width: 12),
                          Flexible(
                            child: Text('тренировок\nсегодня',
                                style: TextStyle(fontSize: 22, height: 1.1, fontWeight: FontWeight.bold, color: c.ink)),
                          ),
                        ],
                      ),
                    ),
                  ),
                  // Строка ближайшего занятия.
                  if (d.nextAt != null)
                    GestureDetector(
                      onTap: () => context.push('/calendar'),
                      behavior: HitTestBehavior.opaque,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
                        child: Row(
                          children: <Widget>[
                            Flexible(
                              child: Text(
                                <String>[
                                  'СЛЕД. · ${d.nextTime}',
                                  if (d.nextName?.isNotEmpty == true) d.nextName!.toUpperCase(),
                                  if (d.nextTitle?.isNotEmpty == true) d.nextTitle!.toUpperCase(),
                                ].join(' · '),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppFonts.mono(size: 11, color: c.inkMuted, weight: FontWeight.w700),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(4)),
                              child: Text(_diffShort(d.nextAt!, DateTime.now()),
                                  style: AppFonts.mono(size: 10, color: c.accentOn, weight: FontWeight.w700)),
                            ),
                            const SizedBox(width: 6),
                            Icon(Icons.arrow_forward, size: 16, color: c.accent),
                          ],
                        ),
                      ),
                    )
                  else
                    const SizedBox(height: 6),
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
                        title: 'Сообщения',
                        sub: 'клиенты на связи',
                        value: _pad2(d.unread),
                        metric: 'новых',
                        icon: Icons.chat_bubble_outline,
                        primary: msgPrimary,
                        onTap: () => context.push('/chats'),
                      ),
                      _Tile(
                        title: 'База знаний',
                        sub: 'упражнения и шаблоны',
                        value: _pad2(d.knowledgeCount),
                        metric: 'в базе',
                        icon: Icons.menu_book_outlined,
                        onTap: () => context.push('/knowledge'),
                      ),
                      _Tile(
                        title: 'Финансы',
                        sub: 'прибыль за месяц',
                        value: _thousands(d.monthlyProfit),
                        metric: 'тыс ₽',
                        icon: Icons.account_balance_wallet_outlined,
                        valueColor: d.monthlyProfit < 0 ? c.danger : null,
                        onTap: () => context.push('/accounting'),
                      ),
                      _Tile(
                        title: 'Уведомления',
                        sub: alertsPrimary ? 'требуют внимания' : 'нет открытых задач',
                        value: _pad2(d.alerts),
                        metric: alertsPrimary ? 'новых' : 'всё тихо',
                        icon: Icons.notifications_none,
                        primary: alertsPrimary,
                        onTap: () => context.push('/notifications'),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
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
    this.valueColor,
  });
  final String title;
  final String sub;
  final String value;
  final String metric;
  final IconData icon;
  final VoidCallback onTap;
  final bool primary;
  final Color? valueColor;

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
                Text(value, style: AppFonts.display(size: 34, color: valueColor ?? fg, letterSpacing: -1)),
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
