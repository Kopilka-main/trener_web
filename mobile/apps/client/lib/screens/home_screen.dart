import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_home.dart';
import '../api/client_trainer.dart';

const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

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
          data: (HomeData d) {
            final TrainerPublic? trainer = ref.watch(clientTrainerProvider).valueOrNull;
            final bool showTrainer = d.linked && trainer != null;
            return RefreshIndicator(
            onRefresh: () async => ref.invalidate(clientHomeProvider),
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: <Widget>[
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                // Шапка: слева тренер (аватар+имя → /trainer, только если подключён),
                // справа всегда шестерёнка → профиль.
                Row(
                  children: <Widget>[
                    Expanded(
                      child: showTrainer
                          ? GestureDetector(
                              onTap: () => context.push('/trainer'),
                              behavior: HitTestBehavior.opaque,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: <Widget>[
                                  AuthedAvatar(
                                    url: trainer.avatarFileId != null
                                        ? ref.read(clientTrainerApiProvider).avatarUrl(trainer.avatarFileId!)
                                        : null,
                                    token: ref.watch(sessionProvider).token,
                                    initials: trainer.initials,
                                    radius: 18,
                                  ),
                                  const SizedBox(width: 10),
                                  Flexible(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: <Widget>[
                                        Text(trainer.fullName,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                                fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                                        Text('тренер', style: TextStyle(fontSize: 11, color: c.inkMuted)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                    IconButton(
                      onPressed: () => context.push('/settings'),
                      icon: Icon(Icons.settings_outlined, size: 30, color: c.inkMuted),
                      tooltip: 'Профиль',
                    ),
                  ],
                ),
                // Hero: счётчик / CTA подключения.
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                  child: !d.linked
                      ? GestureDetector(
                          onTap: () => context.push('/connect'),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text('Подключите\nтренера',
                                  style: AppFonts.display(size: 30, color: c.accent, height: 1.1)),
                              const SizedBox(height: 6),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: <Widget>[
                                  Text('чтобы видеть занятия и прогресс',
                                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.inkMuted)),
                                  const SizedBox(width: 4),
                                  Icon(Icons.arrow_forward, size: 15, color: c.accent),
                                ],
                              ),
                            ],
                          ),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            GestureDetector(
                              onTap: () => context.push('/settings'),
                              behavior: HitTestBehavior.opaque,
                              child: Row(
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
                            if (d.nextSessionAt != null && d.nextSessionLabel != null) ...<Widget>[
                              const SizedBox(height: 6),
                              GestureDetector(
                                onTap: () => context.push('/calendar'),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: <Widget>[
                                    Text('СЛЕД. · ${d.nextSessionLabel!.toUpperCase()}',
                                        style: AppFonts.mono(size: 11, color: c.inkMuted)),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                          color: c.accent, borderRadius: BorderRadius.circular(4)),
                                      child: Text(_diffShort(d.nextSessionAt!, DateTime.now()),
                                          style: AppFonts.mono(size: 10, color: c.accentOn)),
                                    ),
                                    const SizedBox(width: 6),
                                    Icon(Icons.arrow_forward, size: 16, color: c.accent),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                ),
                      ],
                    ),
                  ),
                ),
                // Сетка плиток 2×3 — тянется на всю оставшуюся высоту (как flex-1
                // grid-rows-3 в вебе): три равных ряда, плитки заполняют экран.
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
                    child: _TileGrid(
                      tiles: <Widget>[
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
                      sub: 'рекорды и графики',
                      value: _pad2(d.recordsCount),
                      metric: 'рекордов',
                      icon: Icons.trending_up,
                      onTap: () => context.push('/progress'),
                    ),
                    _Tile(
                      title: 'База знаний',
                      sub: 'упражнения с тренировок',
                      value: _pad2(d.knowledgeCount),
                      metric: 'упражнений',
                      icon: Icons.menu_book_outlined,
                      onTap: () => context.push('/knowledge'),
                    ),
                    _Tile(
                      title: 'Уведомления',
                      sub: d.attention > 0 ? 'требуют внимания' : 'нет открытых задач',
                      value: d.attention > 0 ? _pad2(d.attention) : null,
                      metric: 'новых',
                      kicker: d.attention > 0 ? 'НОВЫЕ' : 'ВСЁ ТИХО',
                      icon: Icons.notifications_none,
                      // Один acid-fill: чат при непрочитанных, иначе уведомления.
                      primary: d.unread == 0 && d.attention > 0,
                      onTap: () => context.push('/notifications'),
                    ),
                      ],
                    ),
                  ),
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

/// Сетка 2×3 из ровно 6 плиток, тянущаяся на всю высоту: три равных ряда
/// (каждый — Expanded), по две равные плитки в ряду. Зеркало web `grid-rows-3 flex-1`.
class _TileGrid extends StatelessWidget {
  const _TileGrid({required this.tiles});
  final List<Widget> tiles;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        for (int r = 0; r < 3; r++) ...<Widget>[
          if (r > 0) const SizedBox(height: 8),
          Expanded(
            child: Row(
              children: <Widget>[
                Expanded(child: tiles[r * 2]),
                const SizedBox(width: 8),
                Expanded(child: tiles[r * 2 + 1]),
              ],
            ),
          ),
        ],
      ],
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
    this.kicker,
    this.primary = false,
  });
  final String title;
  final String sub;
  // null → число не показываем (например, «ВСЁ ТИХО» на плитке уведомлений).
  final String? value;
  final String metric;
  final IconData icon;
  final VoidCallback onTap;
  // Mono-кикер над числом (например, «НОВЫЕ» / «ВСЁ ТИХО»).
  final String? kicker;
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
            if (kicker != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(kicker!,
                    style: AppFonts.mono(
                        size: 10,
                        color: primary ? c.accentOn.withValues(alpha: 0.55) : c.inkMutedXl,
                        weight: FontWeight.w700)),
              ),
            if (value != null) ...<Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: <Widget>[
                  Text(value!, style: AppFonts.display(size: 34, color: fg, letterSpacing: -1)),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(metric.toUpperCase(),
                        maxLines: 2,
                        style: AppFonts.mono(size: 10, color: metricColor, weight: FontWeight.w700)),
                  ),
                ],
              ),
              const SizedBox(height: 4),
            ],
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
