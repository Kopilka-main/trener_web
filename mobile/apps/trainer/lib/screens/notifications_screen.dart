import 'dart:async';

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

/// «ДД/ММ/ГГГГ» с ведущими нулями — заголовок группы (как у клиентского экрана).
String _groupLabel(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

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

/// Дата ближайшего дня рождения (без времени) — на неё приходится ДР в окне.
DateTime _nextBirthdayDate(String birthDate, DateTime now) {
  final DateTime bd = DateTime.parse(birthDate);
  final DateTime today = DateTime(now.year, now.month, now.day);
  DateTime next = DateTime(now.year, bd.month, bd.day);
  if (next.isBefore(today)) next = DateTime(now.year + 1, bd.month, bd.day);
  return next;
}

/// Виды СОБЫТИЙ (информационные, без действия). Алерты идут отдельно (TrainerAlert).
enum _EventKind { today, pending, confirmed, birthday }

class _Event {
  _Event(this.id, this.kind, this.title, this.message, this.route, this.date);
  final String id;
  final _EventKind kind;
  final String title;
  final String message;
  final String route;

  /// Дата события (без времени) — для группировки/сортировки.
  final DateTime date;
}

/// Единый элемент ленты уведомлений: важный (алерт) ИЛИ второстепенный (событие).
/// Важность: ВАЖНОЕ — все алерты, ВТОРОСТЕПЕННОЕ — все события.
class _Item {
  _Item.alert(TrainerAlert a)
      : id = a.id,
        date = a.date,
        important = true,
        alert = a,
        event = null;
  _Item.event(_Event e)
      : id = e.id,
        date = e.date,
        important = false,
        alert = null,
        event = e;

  final String id;
  final DateTime date;
  final bool important;
  final TrainerAlert? alert;
  final _Event? event;
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
/// подтверждения, подтверждённые, дни рождения). Всё в едином списке, сгруппировано
/// по дате (новые/будущие сверху), важные — над второстепенными внутри группы.
/// Заход помечает ВСЕ уведомления «увиденными»; непросмотренные помечаются кружком.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _markedSeen = false;

  /// Снимок «увиденного» НА МОМЕНТ входа (до markSeen) — по нему рисуем кружки.
  Set<String>? _seenSnapshot;

  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // Регулярный автоопрос, пока экран открыт: новые/изменившиеся уведомления
    // (напр. клиент согласовал занятие) появляются в моменте. Алерты выводятся
    // из этих трёх FutureProvider-ов (см. trainerAlertsProvider), поэтому
    // инвалидируем их все; trainerNotifProvider (seen/dismissed) НЕ трогаем.
    _poll = Timer.periodic(const Duration(seconds: 12), (_) {
      if (!mounted) return;
      ref.invalidate(trainerSessionsProvider);
      ref.invalidate(trainerClientsProvider);
      ref.invalidate(trainerBalancesProvider);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  /// Собирает все события (второстепенные) из сессий/клиентов.
  List<_Event> _buildEvents(List<Session> all, List<Client> clients, DateTime now) {
    final List<_Event> events = <_Event>[];

    // Сегодняшние занятия.
    for (final Session s in all) {
      if (s.status == SessionStatus.planned && _sameDay(s.start, now) && !s.start.isBefore(now)) {
        events.add(_Event('event:today:${s.id}', _EventKind.today, s.clientName,
            'Сегодня в ${s.startTime}', '/calendar', DateTime(s.start.year, s.start.month, s.start.day)));
      }
    }
    // Дни рождения (сегодня и в ближайшую неделю).
    for (final Client cl in clients) {
      final int? d = _daysToBirthday(cl.birthDate, now);
      if (d != null && d <= 7) {
        final DateTime bday = _nextBirthdayDate(cl.birthDate!, now);
        events.add(_Event('event:birthday:${cl.id}', _EventKind.birthday, cl.fullName,
            d == 0 ? 'Сегодня день рождения 🎉' : 'День рождения через $d дн.', '/clients', bday));
      }
    }
    // Ждут подтверждения (будущие, pending).
    for (final Session s in all) {
      if (s.status == SessionStatus.planned &&
          s.confirmation == ClientConfirmation.pending &&
          !s.start.isBefore(now)) {
        events.add(_Event('event:pending:${s.id}', _EventKind.pending, s.clientName,
            '${_when(s)} — ждёт подтверждения', '/calendar', DateTime(s.start.year, s.start.month, s.start.day)));
      }
    }
    // Недавно подтверждённые будущие.
    for (final Session s in all) {
      if (s.status == SessionStatus.planned &&
          s.confirmation == ClientConfirmation.confirmed &&
          !s.start.isBefore(now)) {
        events.add(_Event('event:confirmed:${s.id}', _EventKind.confirmed, s.clientName,
            '${_when(s)} — клиент подтвердил', '/calendar', DateTime(s.start.year, s.start.month, s.start.day)));
      }
    }

    return events;
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Session>> sessions = ref.watch(trainerSessionsProvider);

    final List<TrainerAlert> visibleAlerts = ref.watch(trainerVisibleAlertsProvider);

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
                // При автоопросе показываем текущие данные, а не спиннер —
                // крутилка только при первичной загрузке (когда данных ещё нет).
                skipLoadingOnRefresh: true,
                skipLoadingOnReload: true,
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
                  final List<_Event> events = _buildEvents(all, clients, now);

                  // Единый список: алерты (важные) + события (второстепенные).
                  final List<_Item> items = <_Item>[
                    ...visibleAlerts.map(_Item.alert),
                    ...events.map(_Item.event),
                  ];

                  // Заход = «увидел текущие уведомления». Снимок seen делаем ДО
                  // markSeen — по нему рисуем кружки непросмотренного.
                  if (!_markedSeen) {
                    _markedSeen = true;
                    _seenSnapshot = <String>{...ref.read(trainerNotifProvider).seen};
                    final List<String> allIds = <String>[for (final _Item it in items) it.id];
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      ref.read(trainerNotifProvider.notifier).markSeen(allIds);
                    });
                  }
                  final Set<String> seenSnap = _seenSnapshot ?? <String>{};

                  if (items.isEmpty) {
                    return Center(child: Text('Уведомлений нет', style: TextStyle(color: c.inkMuted)));
                  }

                  // Группируем по дате (год-месяц-день).
                  final Map<DateTime, List<_Item>> groups = <DateTime, List<_Item>>{};
                  for (final _Item it in items) {
                    final DateTime key = DateTime(it.date.year, it.date.month, it.date.day);
                    (groups[key] ??= <_Item>[]).add(it);
                  }
                  // Даты по убыванию (новые/будущие сверху).
                  final List<DateTime> dates = groups.keys.toList()
                    ..sort((DateTime a, DateTime b) => b.compareTo(a));

                  final List<Widget> children = <Widget>[];
                  for (final DateTime day in dates) {
                    final List<_Item> group = groups[day]!;
                    // Внутри группы: важные (стабильный порядок), затем второстепенные.
                    final List<_Item> important = <_Item>[for (final _Item it in group) if (it.important) it];
                    final List<_Item> minor = <_Item>[for (final _Item it in group) if (!it.important) it];

                    children.add(Padding(
                      padding: const EdgeInsets.only(top: 18, bottom: 8, left: 4),
                      child: Text(
                        _groupLabel(day),
                        style: AppFonts.mono(
                          size: 11,
                          color: c.inkMutedXl,
                          weight: FontWeight.w700,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ));

                    for (final _Item it in important) {
                      children.add(_ImportantCard(
                        alert: it.alert!,
                        unseen: !seenSnap.contains(it.id),
                        onTap: () => context.push(it.alert!.clientId != null ? '/clients' : '/calendar'),
                        onDismiss: () => ref.read(trainerNotifProvider.notifier).dismiss(it.id),
                      ));
                    }
                    for (final _Item it in minor) {
                      children.add(_EventCard(
                        event: it.event!,
                        unseen: !seenSnap.contains(it.id),
                        onTap: () => context.push(it.event!.route),
                      ));
                    }
                  }

                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(trainerSessionsProvider);
                      ref.invalidate(trainerClientsProvider);
                      ref.invalidate(trainerBalancesProvider);
                    },
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      children: children,
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

/// Кружок непросмотренного (trailing карточки).
class _UnseenDot extends StatelessWidget {
  const _UnseenDot();
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle),
    );
  }
}

/// Важная (выразительная) карточка — для алертов. Фон/полоса/иконка тонированы
/// под severity (danger → красный, warn → accent). Текст НЕ красный (ink/inkMuted).
class _ImportantCard extends StatelessWidget {
  const _ImportantCard({
    required this.alert,
    required this.unseen,
    required this.onTap,
    required this.onDismiss,
  });
  final TrainerAlert alert;
  final bool unseen;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    // danger → красный (severity, по правилу памяти); иначе accent.
    final Color accent = alert.severity == TrainerAlertSeverity.danger ? c.danger : c.accent;
    return Dismissible(
      key: ValueKey<String>(alert.id),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDismiss(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(color: c.cardElevated, borderRadius: BorderRadius.circular(14)),
        child: Icon(Icons.close, size: 20, color: c.inkMuted),
      ),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(14),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Container(width: 4, color: accent),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: Row(
                        children: <Widget>[
                          Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                              color: accent.withValues(alpha: 0.18),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(_alertIcon(alert.type), size: 18, color: accent),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(alert.clientName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                        fontSize: 14, fontWeight: FontWeight.w700, color: c.ink)),
                                Text(alert.message, style: TextStyle(fontSize: 13, color: c.inkMuted)),
                              ],
                            ),
                          ),
                          if (unseen) ...<Widget>[
                            const SizedBox(width: 10),
                            const _UnseenDot(),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Второстепенная карточка — для событий (обычный вид: card, accent-иконка).
class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, required this.unseen, required this.onTap});
  final _Event event;
  final bool unseen;
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
            if (unseen) ...<Widget>[
              const SizedBox(width: 10),
              const _UnseenDot(),
            ],
          ],
        ),
      ),
    );
  }
}
