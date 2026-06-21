import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_calendar.dart';
import '../api/trainer_clients.dart';
import '../api/trainer_notifications.dart';

const List<String> _ruMonths = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

String _when(Session s) {
  final DateTime d = s.start;
  return '${d.day} ${_ruMonths[d.month - 1]}, ${s.startTime}';
}

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// Дней до ближайшего дня рождения (0 — сегодня), либо null если дата кривая.
int? _daysToBirthday(String? birthDate, DateTime now) {
  if (birthDate == null) return null;
  final DateTime? bd = DateTime.tryParse(birthDate);
  if (bd == null) return null;
  DateTime next = DateTime(now.year, bd.month, bd.day);
  final DateTime today = DateTime(now.year, now.month, now.day);
  if (next.isBefore(today)) next = DateTime(now.year + 1, bd.month, bd.day);
  return next.difference(today).inDays;
}

/// Виды СОБЫТИЙ (информационные, без действия). Алерты идут отдельно (TrainerAlert).
enum _EventKind { today, pending, confirmed, birthday }

class _Event {
  _Event(this.kind, this.title, this.message, this.route);
  final _EventKind kind;
  final String title;
  final String message;
  final String route;
}

IconData _eventIcon(_EventKind k) => switch (k) {
      _EventKind.today => Icons.today_outlined,
      _EventKind.pending => Icons.hourglass_empty,
      _EventKind.confirmed => Icons.event_available_outlined,
      _EventKind.birthday => Icons.cake_outlined,
    };

IconData _alertIcon(TrainerAlertType t) => switch (t) {
      TrainerAlertType.cancelled => Icons.event_busy_outlined,
      TrainerAlertType.declined => Icons.event_busy_outlined,
      TrainerAlertType.onlineToday => Icons.wifi,
      TrainerAlertType.noUpcoming => Icons.account_balance_wallet_outlined,
    };

/// Уведомления тренера: actionable-алерты (отменённые/отклонённые занятия, онлайн
/// сегодня, оплатил-но-не-записан) + информационные события (сегодня, ждут
/// подтверждения, подтверждённые, дни рождения). Зеркало веб-NotificationsPage:
/// заход помечает алерты «увиденными» (счётчик плитки гаснет), свайп — скрывает.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _markedSeen = false;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Session>> sessions = ref.watch(trainerSessionsProvider);

    // Заход на экран = «увидел текущие алерты» → плитка главной гаснет. Делаем
    // после первой загрузки данных (как в вебе — после рендера списка алертов).
    final List<TrainerAlert> visibleAlerts = ref.watch(trainerVisibleAlertsProvider);
    if (!_markedSeen && sessions.hasValue) {
      _markedSeen = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(trainerNotifProvider.notifier).markSeen(visibleAlerts.map((TrainerAlert a) => a.id));
      });
    }

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
                  final List<Client> clients =
                      ref.watch(trainerClientsProvider).valueOrNull ?? <Client>[];
                  final List<_Event> events = <_Event>[];

                  // Сегодняшние занятия.
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned && _sameDay(s.start, now) && !s.start.isBefore(now)) {
                      events.add(_Event(_EventKind.today, s.clientName, 'Сегодня в ${s.startTime}', '/calendar'));
                    }
                  }
                  // Дни рождения (сегодня и в ближайшую неделю).
                  for (final Client cl in clients) {
                    final int? d = _daysToBirthday(cl.birthDate, now);
                    if (d != null && d <= 7) {
                      events.add(_Event(_EventKind.birthday, cl.fullName,
                          d == 0 ? 'Сегодня день рождения 🎉' : 'День рождения через $d дн.', '/clients'));
                    }
                  }
                  // Ждут подтверждения (будущие, pending).
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned &&
                        s.confirmation == ClientConfirmation.pending &&
                        !s.start.isBefore(now)) {
                      events.add(_Event(_EventKind.pending, s.clientName, '${_when(s)} — ждёт подтверждения', '/calendar'));
                    }
                  }
                  // Недавно подтверждённые будущие.
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned &&
                        s.confirmation == ClientConfirmation.confirmed &&
                        !s.start.isBefore(now)) {
                      events.add(_Event(_EventKind.confirmed, s.clientName, '${_when(s)} — клиент подтвердил', '/calendar'));
                    }
                  }

                  if (visibleAlerts.isEmpty && events.isEmpty) {
                    return Center(child: Text('Уведомлений нет', style: TextStyle(color: c.inkMuted)));
                  }
                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(trainerSessionsProvider);
                      ref.invalidate(trainerClientsProvider);
                      ref.invalidate(trainerBalancesProvider);
                    },
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      children: <Widget>[
                        // Алерты «требует действия» — сверху, со свайпом-скрытием.
                        ...visibleAlerts.map((TrainerAlert a) => _AlertCard(
                              alert: a,
                              onTap: () => context.push(a.clientId != null ? '/clients' : '/calendar'),
                              onDismiss: () => ref.read(trainerNotifProvider.notifier).dismiss(a.id),
                            )),
                        // Информационные события.
                        ...events.map((_Event it) => _EventCard(
                              event: it,
                              onTap: () => context.push(it.route),
                            )),
                      ],
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

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.alert, required this.onTap, required this.onDismiss});
  final TrainerAlert alert;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    // danger → красная иконка (severity, по правилу памяти); warn → accent.
    final Color iconColor = alert.severity == TrainerAlertSeverity.danger ? c.danger : c.accent;
    return Dismissible(
      key: ValueKey<String>(alert.id),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDismiss(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(color: c.cardElevated, borderRadius: BorderRadius.circular(16)),
        child: Icon(Icons.close, size: 20, color: c.inkMuted),
      ),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
          child: Row(
            children: <Widget>[
              Icon(_alertIcon(alert.type), size: 18, color: iconColor),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(alert.clientName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                    Text(alert.message, style: TextStyle(fontSize: 13, color: c.inkMuted)),
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

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, required this.onTap});
  final _Event event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: <Widget>[
            Icon(_eventIcon(event.kind), size: 18, color: c.accent),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(event.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
                  Text(event.message, style: TextStyle(fontSize: 13, color: c.inkMuted)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
