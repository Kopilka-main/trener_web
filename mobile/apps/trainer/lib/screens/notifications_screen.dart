import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_calendar.dart';

const List<String> _ruMonths = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

String _when(Session s) {
  final DateTime d = s.start;
  return '${d.day} ${_ruMonths[d.month - 1]}, ${s.startTime}';
}

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

enum _Kind { declined, today, pending, confirmed }

class _Item {
  _Item(this.kind, this.title, this.message, this.session);
  final _Kind kind;
  final String title;
  final String message;
  final Session session;
}

IconData _icon(_Kind k) => switch (k) {
      _Kind.declined => Icons.event_busy_outlined,
      _Kind.today => Icons.today_outlined,
      _Kind.pending => Icons.hourglass_empty,
      _Kind.confirmed => Icons.event_available_outlined,
    };

/// Уведомления тренера: actionable-события по занятиям (отклонённые → переназначить,
/// сегодня, ждут подтверждения, подтверждённые). Зеркало actionable-части веба.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<Session>> sessions = ref.watch(trainerSessionsProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              child: Text('Уведомления', style: AppFonts.display(size: 24, color: c.ink)),
            ),
            Expanded(
              child: sessions.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (Object e, _) => Center(
                  child: FilledButton(
                      onPressed: () => ref.invalidate(trainerSessionsProvider),
                      child: const Text('Повторить')),
                ),
                data: (List<Session> all) {
                  final DateTime now = DateTime.now();
                  final List<_Item> items = <_Item>[];

                  // Отклонённые будущие — требуют переназначения.
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned &&
                        s.confirmation == ClientConfirmation.declined &&
                        !s.start.isBefore(now)) {
                      items.add(_Item(_Kind.declined, s.clientName,
                          '${_when(s)} — клиент отклонил, переназначьте', s));
                    }
                  }
                  // Сегодняшние занятия.
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned && _sameDay(s.start, now) && !s.start.isBefore(now)) {
                      items.add(_Item(_Kind.today, s.clientName, 'Сегодня в ${s.startTime}', s));
                    }
                  }
                  // Ждут подтверждения (будущие, pending).
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned &&
                        s.confirmation == ClientConfirmation.pending &&
                        !s.start.isBefore(now)) {
                      items.add(_Item(_Kind.pending, s.clientName, '${_when(s)} — ждёт подтверждения', s));
                    }
                  }
                  // Недавно подтверждённые будущие.
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned &&
                        s.confirmation == ClientConfirmation.confirmed &&
                        !s.start.isBefore(now)) {
                      items.add(_Item(_Kind.confirmed, s.clientName, '${_when(s)} — клиент подтвердил', s));
                    }
                  }

                  if (items.isEmpty) {
                    return Center(child: Text('Уведомлений нет', style: TextStyle(color: c.inkMuted)));
                  }
                  return RefreshIndicator(
                    onRefresh: () async => ref.invalidate(trainerSessionsProvider),
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      itemCount: items.length,
                      itemBuilder: (BuildContext ctx, int i) {
                        final _Item it = items[i];
                        return GestureDetector(
                          onTap: () => context.push('/calendar'),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                            child: Row(
                              children: <Widget>[
                                Icon(_icon(it.kind),
                                    size: 18, color: it.kind == _Kind.declined ? c.danger : c.accent),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text(it.title,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                                      Text(it.message, style: TextStyle(fontSize: 13, color: c.inkMuted)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
