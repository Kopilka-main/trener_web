import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_calendar.dart';

/// Календарь тренера: SessionsCalendar (День/Неделя/Месяц) с именами клиентов +
/// шит занятия с подтверждением клиента и действиями «Провести»/«Отменить».
class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Session>> sessions = ref.watch(trainerSessionsProvider);
    final AppColors c = context.colors;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              child: Text('Календарь', style: AppFonts.display(size: 24, color: c.ink)),
            ),
            Expanded(
              child: sessions.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (Object e, _) => _Retry(onRetry: () => ref.invalidate(trainerSessionsProvider)),
                data: (List<Session> all) {
                  final Map<String, Session> byId = <String, Session>{for (final Session s in all) s.id: s};
                  return SessionsCalendar(
                    sessions: all.map((Session s) => s.toCal()).toList(),
                    defaultView: CalendarView.week,
                    onSessionTap: (CalSession cs) {
                      final Session? s = byId[cs.id];
                      if (s != null) _showSheet(context, ref, s);
                    },
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

class _Retry extends StatelessWidget {
  const _Retry({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Text('Не удалось загрузить занятия'),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
      ),
    );
  }
}

void _showSheet(BuildContext context, WidgetRef ref, Session s) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.colors.bg,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _SessionSheet(session: s),
  );
}

/// Шит занятия (тренер): клиент, дата/время, формат, заметка, статус подтверждения
/// клиентом + действия «Провести»/«Отменить» для запланированного занятия.
class _SessionSheet extends ConsumerStatefulWidget {
  const _SessionSheet({required this.session});
  final Session session;

  @override
  ConsumerState<_SessionSheet> createState() => _SessionSheetState();
}

class _SessionSheetState extends ConsumerState<_SessionSheet> {
  bool _busy = false;

  Future<void> _setStatus(SessionStatus status, String done) async {
    setState(() => _busy = true);
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    try {
      await ref.read(trainerCalendarApiProvider).setStatus(widget.session.id, status);
      ref.invalidate(trainerSessionsProvider);
      if (!mounted) return;
      nav.pop();
      messenger.showSnackBar(SnackBar(content: Text(done)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(const SnackBar(content: Text('Не удалось изменить занятие')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final Session s = widget.session;
    final bool isPlanned = s.status == SessionStatus.planned;
    final String confLabel = switch (s.confirmation) {
      ClientConfirmation.confirmed => 'Клиент подтвердил',
      ClientConfirmation.declined => 'Клиент отклонил',
      _ => 'Ожидает ответа клиента',
    };
    final DateTime d = calParseIso(s.date);
    final String dateLabel = '${d.day} ${calMonthGen[d.month - 1]}';
    final String timeLabel = '${s.startTime}–${calEndTime(s.startTime, s.durationMin)}';

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 16 + MediaQuery.of(context).viewPadding.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(s.clientName.isNotEmpty ? s.clientName : 'Без клиента',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
          if (s.title?.trim().isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 2),
            Text(s.title!.trim(), style: TextStyle(fontSize: 14, color: c.inkMuted)),
          ],
          const SizedBox(height: 12),
          Text('$dateLabel, $timeLabel',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
          const SizedBox(height: 4),
          Text(calHumanDuration(s.durationMin), style: TextStyle(fontSize: 14, color: c.inkMuted)),
          const SizedBox(height: 4),
          if (s.isOnline)
            Row(children: <Widget>[
              Icon(Icons.wifi, size: 14, color: c.inkMuted),
              const SizedBox(width: 6),
              Text('Онлайн-занятие', style: TextStyle(fontSize: 14, color: c.inkMuted)),
            ])
          else if (s.location?.trim().isNotEmpty == true)
            Text(s.location!.trim(), style: TextStyle(fontSize: 14, color: c.inkMuted)),
          if (s.note?.trim().isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 4),
            Text(s.note!.trim(), style: TextStyle(fontSize: 14, color: c.inkMuted)),
          ],
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
            child: Text(confLabel,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.inkMuted)),
          ),
          if (isPlanned) ...<Widget>[
            const SizedBox(height: 16),
            Row(
              children: <Widget>[
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : () => _setStatus(SessionStatus.completed, 'Занятие проведено'),
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                    child: _busy
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Провести'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : () => _setStatus(SessionStatus.cancelled, 'Занятие отменено'),
                    style: FilledButton.styleFrom(
                      backgroundColor: c.card,
                      foregroundColor: c.danger,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const Text('Отменить'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
