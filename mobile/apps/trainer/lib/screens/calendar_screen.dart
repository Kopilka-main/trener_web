import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_calendar.dart';

const List<String> _ruMonths = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const List<String> _ruWeekdays = <String>[
  'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
];

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

String _dayHeader(DateTime d) {
  final DateTime now = DateTime.now();
  if (_sameDay(d, now)) return 'Сегодня';
  if (_sameDay(d, now.add(const Duration(days: 1)))) return 'Завтра';
  return '${d.day} ${_ruMonths[d.month - 1]}, ${_ruWeekdays[d.weekday - 1]}';
}

String _timeRange(Session s) {
  String hhmm(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  return '${hhmm(s.start)}–${hhmm(s.end)}';
}

/// Вкладки фильтра (в нижней панели — для one-handed UX).
enum _Tab { upcoming, history }

final StateProvider<_Tab> _tabProvider = StateProvider<_Tab>((_) => _Tab.upcoming);

class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Session>> sessions = ref.watch(trainerSessionsProvider);
    final _Tab tab = ref.watch(_tabProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Календарь')),
      body: sessions.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => _ErrorView(
          onRetry: () => ref.invalidate(trainerSessionsProvider),
        ),
        data: (List<Session> all) {
          final DateTime now = DateTime.now();
          final List<Session> filtered = all.where((Session s) {
            final bool isPast = s.end.isBefore(now);
            final bool isCancelled = s.status == SessionStatus.cancelled;
            return tab == _Tab.upcoming ? (!isPast && !isCancelled) : (isPast || isCancelled);
          }).toList();
          if (tab == _Tab.history) {
            filtered.sort((Session a, Session b) => b.start.compareTo(a.start));
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(trainerSessionsProvider),
            child: filtered.isEmpty
                ? ListView(
                    children: <Widget>[
                      SizedBox(height: MediaQuery.of(context).size.height * 0.3),
                      Center(
                        child: Text(
                          tab == _Tab.upcoming ? 'Нет предстоящих занятий' : 'История пуста',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                    ],
                  )
                : _SessionList(sessions: filtered),
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: SegmentedButton<_Tab>(
          segments: const <ButtonSegment<_Tab>>[
            ButtonSegment<_Tab>(value: _Tab.upcoming, label: Text('Предстоящие')),
            ButtonSegment<_Tab>(value: _Tab.history, label: Text('История')),
          ],
          selected: <_Tab>{tab},
          onSelectionChanged: (Set<_Tab> s) => ref.read(_tabProvider.notifier).state = s.first,
        ),
      ),
    );
  }
}

class _SessionList extends StatelessWidget {
  const _SessionList({required this.sessions});
  final List<Session> sessions;

  @override
  Widget build(BuildContext context) {
    final List<Widget> items = <Widget>[];
    DateTime? prevDay;
    for (final Session s in sessions) {
      if (prevDay == null || !_sameDay(prevDay, s.start)) {
        items.add(Padding(
          padding: EdgeInsets.fromLTRB(16, items.isEmpty ? 16 : 24, 16, 8),
          child: Text(
            _dayHeader(s.start),
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.3),
          ),
        ));
        prevDay = s.start;
      }
      items.add(_SessionCard(session: s));
    }
    items.add(const SizedBox(height: 12));
    return ListView(children: items);
  }
}

class _SessionCard extends ConsumerWidget {
  const _SessionCard({required this.session});
  final Session session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: InkWell(
        onTap: () => _showDetail(context, session),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(_timeRange(session),
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text('${session.durationMin} мин',
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      session.clientName.isNotEmpty ? session.clientName : 'Без клиента',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: <Widget>[
                        Icon(session.isOnline ? Icons.videocam_outlined : Icons.place_outlined,
                            size: 14, color: cs.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            session.isOnline
                                ? 'Онлайн'
                                : (session.location?.trim().isNotEmpty == true
                                    ? session.location!
                                    : (session.title?.trim().isNotEmpty == true
                                        ? session.title!
                                        : 'Тренировка')),
                            style: Theme.of(context).textTheme.bodySmall,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _StatusChip(session: session),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Состояние занятия глазами тренера: статус + отметка подтверждения клиентом.
/// Текст нейтральный; акцент (primary) — у «клиент подтвердил».
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.session});
  final Session session;

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    final (String label, Color color) = switch (session) {
      Session s when s.status == SessionStatus.cancelled => ('Отменено', cs.onSurfaceVariant),
      Session s when s.status == SessionStatus.completed => ('Проведено', cs.onSurfaceVariant),
      Session s when s.confirmation == ClientConfirmation.confirmed =>
        ('Клиент подтвердил', cs.primary),
      Session s when s.confirmation == ClientConfirmation.declined =>
        ('Клиент отклонил', cs.onSurfaceVariant),
      _ => ('Ожидает ответа', cs.onSurfaceVariant),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Text('Не удалось загрузить календарь'),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
      ),
    );
  }
}

void _showDetail(BuildContext context, Session s) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (BuildContext ctx) => _DetailSheet(session: s),
  );
}

class _DetailSheet extends ConsumerStatefulWidget {
  const _DetailSheet({required this.session});
  final Session session;

  @override
  ConsumerState<_DetailSheet> createState() => _DetailSheetState();
}

class _DetailSheetState extends ConsumerState<_DetailSheet> {
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
    final Session s = widget.session;
    final ColorScheme cs = Theme.of(context).colorScheme;
    final bool isPlanned = s.status == SessionStatus.planned;
    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 4, 20, 16 + MediaQuery.of(context).viewPadding.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            s.clientName.isNotEmpty ? s.clientName : 'Без клиента',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          if (s.title?.trim().isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 2),
            Text(s.title!.trim(),
                style: TextStyle(fontSize: 15, color: cs.onSurfaceVariant)),
          ],
          const SizedBox(height: 12),
          _DetailRow(icon: Icons.event_outlined, text: _dayHeader(s.start)),
          _DetailRow(icon: Icons.schedule_outlined, text: '${_timeRange(s)} · ${s.durationMin} мин'),
          _DetailRow(
            icon: s.isOnline ? Icons.videocam_outlined : Icons.place_outlined,
            text: s.isOnline
                ? 'Онлайн'
                : (s.location?.trim().isNotEmpty == true ? s.location! : 'Место не указано'),
          ),
          if (s.note?.trim().isNotEmpty == true)
            _DetailRow(icon: Icons.notes_outlined, text: s.note!.trim()),
          const SizedBox(height: 12),
          _StatusChip(session: s),
          if (isPlanned) ...<Widget>[
            const SizedBox(height: 20),
            Row(
              children: <Widget>[
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy
                        ? null
                        : () => _setStatus(SessionStatus.cancelled, 'Занятие отменено'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: cs.error,
                      side: BorderSide(color: cs.error.withValues(alpha: 0.5)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const Text('Отменить'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy
                        ? null
                        : () => _setStatus(SessionStatus.completed, 'Занятие проведено'),
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                    child: _busy
                        ? const SizedBox(
                            height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Провести'),
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

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 15))),
        ],
      ),
    );
  }
}
