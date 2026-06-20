import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:go_router/go_router.dart';

import '../api/client_auth.dart';
import '../api/client_calendar.dart';

/// Календарь клиента: переиспользуемый SessionsCalendar (День/Неделя/Месяц) +
/// шит занятия с подтверждением/отклонением участия. Вид и поведение — как в вебе.
class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Session>> sessions = ref.watch(clientSessionsProvider);
    final bool linked = ref.watch(clientLinkedProvider).valueOrNull ?? true;
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
              child: !linked
                  ? _NotLinked()
                  : sessions.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (Object e, _) => _Retry(onRetry: () => ref.invalidate(clientSessionsProvider)),
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

/// Клиент не подключён к тренеру — как в вебе: пояснение + переход к подключению.
class _NotLinked extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              'Вы пока не подключены к тренеру. Подключите его, чтобы здесь появились занятия.',
              textAlign: TextAlign.center,
              style: TextStyle(color: c.inkMuted),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => context.push('/connect'),
              child: const Text('Подключить тренера'),
            ),
          ],
        ),
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

/// Шит занятия: дата/время/длительность, формат, заметка, статус и кнопки
/// «Подтвердить»/«Отклонить» (пока ждёт ответа и не отменено).
class _SessionSheet extends ConsumerStatefulWidget {
  const _SessionSheet({required this.session});
  final Session session;

  @override
  ConsumerState<_SessionSheet> createState() => _SessionSheetState();
}

class _SessionSheetState extends ConsumerState<_SessionSheet> {
  bool _busy = false;

  Future<void> _respond(bool accept) async {
    setState(() => _busy = true);
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    try {
      await ref.read(clientCalendarApiProvider).confirm(widget.session.id, accept: accept);
      ref.invalidate(clientSessionsProvider);
      if (!mounted) return;
      nav.pop();
      messenger.showSnackBar(
        SnackBar(content: Text(accept ? 'Участие подтверждено' : 'Занятие отклонено')),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(const SnackBar(content: Text('Не удалось сохранить. Попробуйте снова')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final Session s = widget.session;
    final bool cancelled = s.status == SessionStatus.cancelled;
    final bool canRespond = !cancelled && s.confirmation == ClientConfirmation.pending;
    final String statusLabel = cancelled
        ? 'Отменено тренером'
        : switch (s.confirmation) {
            ClientConfirmation.confirmed => 'Вы подтвердили',
            ClientConfirmation.declined => 'Вы отклонили',
            _ => 'Ожидает ответа',
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
          Text(s.title?.trim().isNotEmpty == true ? s.title! : 'Занятие',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
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
            child: Text(statusLabel,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.inkMuted)),
          ),
          if (canRespond) ...<Widget>[
            const SizedBox(height: 16),
            Row(
              children: <Widget>[
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : () => _respond(true),
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                    child: _busy
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Подтвердить'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : () => _respond(false),
                    style: FilledButton.styleFrom(
                      backgroundColor: c.card,
                      foregroundColor: c.ink,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const Text('Отклонить'),
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
