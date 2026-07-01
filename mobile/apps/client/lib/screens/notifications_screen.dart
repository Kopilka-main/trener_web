import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_calendar.dart';
import '../api/client_chat.dart';
import '../api/client_packages.dart';
import '../api/client_workouts.dart';

const List<String> _ruMonths = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

enum _Kind { confirm, soon, chat, package, workout, measure, payment }

class _Notif {
  _Notif({required this.id, required this.kind, required this.text, required this.to, this.sessionId});
  final String id;
  final _Kind kind;
  final String text;
  final String to;

  /// Для confirm-уведомлений — id занятия, чтобы открыть шторку подтверждения напрямую.
  final String? sessionId;
}

IconData _icon(_Kind k) => switch (k) {
      _Kind.confirm => Icons.event_available_outlined,
      _Kind.soon => Icons.schedule_outlined,
      _Kind.chat => Icons.chat_bubble_outline,
      _Kind.package => Icons.account_balance_wallet_outlined,
      _Kind.workout => Icons.fitness_center,
      _Kind.measure => Icons.straighten,
      _Kind.payment => Icons.payments_outlined,
    };

/// Отброшенные уведомления (в памяти сессии).
final StateProvider<Set<String>> _dismissedProvider = StateProvider<Set<String>>((_) => <String>{});

String _whenLabel(Session s) {
  final DateTime d = calParseIso(s.date);
  return '${d.day} ${_ruMonths[d.month - 1]}, ${s.startTime}';
}

/// Дата платежа "YYYY-MM-DD" → DateTime (без времени). null при кривом формате.
DateTime? _parseDate(String isoDate) {
  final List<String> p = isoDate.split('-');
  if (p.length != 3) return null;
  final int? y = int.tryParse(p[0]);
  final int? m = int.tryParse(p[1]);
  final int? d = int.tryParse(p[2]);
  if (y == null || m == null || d == null) return null;
  return DateTime(y, m, d);
}

/// "YYYY-MM-DD" → "ДД.ММ".
String _dayMonth(String isoDate) {
  final List<String> p = isoDate.split('-');
  return p.length == 3 ? '${p[2]}.${p[1]}' : isoDate;
}

/// Целая сумма с пробелами между тысячами (без копеек).
String _money(num v) {
  final int n = v.round();
  final String s = n.abs().toString();
  final StringBuffer b = StringBuffer();
  for (int i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
    b.write(s[i]);
  }
  return '${n < 0 ? '−' : ''}$b';
}

List<_Notif> _build({
  required List<Session> sessions,
  required List<Workout> workouts,
  required List<ClientPackage> packages,
  required List<ClientMeasurementTask> measurementTasks,
  required int unread,
  required Set<String> dismissed,
}) {
  final DateTime now = DateTime.now();
  final List<_Notif> out = <_Notif>[];

  // Назначенные тренером тренировки (черновики).
  for (final Workout w in workouts) {
    if (!w.createdByClient && w.status == WorkoutStatus.draft) {
      out.add(_Notif(id: 'workout:${w.id}', kind: _Kind.workout, text: 'Новая тренировка от тренера: ${w.name}', to: '/workouts'));
    }
  }

  // Задачи на замеры от тренера.
  for (final ClientMeasurementTask t in measurementTasks) {
    out.add(_Notif(
      id: 'measure:${t.id}',
      kind: _Kind.measure,
      text: t.note?.trim().isNotEmpty == true
          ? 'Тренер просит сделать замеры: ${t.note!.trim()}'
          : 'Тренер просит сделать замеры',
      to: '/progress?tab=measurements',
    ));
  }

  final List<Session> future = sessions
      .where((Session s) => s.status != SessionStatus.cancelled && !s.start.isBefore(now))
      .toList()
    ..sort((Session a, Session b) => a.start.compareTo(b.start));

  for (final Session s in future) {
    if (s.confirmation == ClientConfirmation.pending) {
      out.add(_Notif(id: 'confirm:${s.id}', kind: _Kind.confirm, text: 'Подтвердите занятие ${_whenLabel(s)}', to: '/calendar', sessionId: s.id));
    }
  }

  // Проведённые, но не согласованные за 30 дней.
  final DateTime ago30 = now.subtract(const Duration(days: 30));
  for (final Session s in sessions) {
    if (s.status != SessionStatus.completed || s.confirmation != ClientConfirmation.pending) continue;
    if (!s.start.isBefore(now) || s.start.isBefore(ago30)) continue;
    out.add(_Notif(id: 'confirm:${s.id}', kind: _Kind.confirm, text: 'Подтвердите проведённую тренировку ${_whenLabel(s)}', to: '/calendar', sessionId: s.id));
  }

  // Скоро занятие — ближайшее не-pending в пределах 24ч.
  for (final Session s in future) {
    if (s.confirmation != ClientConfirmation.pending &&
        s.start.difference(now) <= const Duration(hours: 24)) {
      out.add(_Notif(id: 'soon:${s.id}', kind: _Kind.soon, text: 'Скоро занятие: ${_whenLabel(s)}', to: '/calendar'));
      break;
    }
  }

  // Заканчивающийся пакет.
  for (final ClientPackage p in packages) {
    if (!p.isActive || p.remaining > 2) continue;
    final String what = p.workoutType?.isNotEmpty == true ? 'Пакет «${p.workoutType}»' : 'Пакет';
    out.add(_Notif(
      id: 'package:${p.id}',
      kind: _Kind.package,
      text: p.remaining <= 0 ? '$what закончился — обратитесь к тренеру' : '$what заканчивается: осталось ${p.remaining}',
      to: '/chat',
    ));
  }

  // Предстоящие платежи рассрочки — в ближайшие 3 дня (включая сегодня).
  final DateTime today = DateTime(now.year, now.month, now.day);
  for (final ClientPackage p in packages) {
    if (!p.isInstallment) continue;
    for (final ClientInstallment inst in p.installments) {
      if (inst.status != 'pending') continue;
      final DateTime? due = _parseDate(inst.dueDate);
      if (due == null) continue;
      final int daysLeft = due.difference(today).inDays;
      if (daysLeft < 0 || daysLeft > 3) continue;
      out.add(_Notif(
        id: 'installment:${inst.id}',
        kind: _Kind.payment,
        text: 'Платёж ${_money(inst.amount)} ₽ до ${_dayMonth(inst.dueDate)}',
        to: '/notifications',
      ));
    }
  }

  if (unread > 0) {
    out.add(_Notif(id: 'chat', kind: _Kind.chat, text: 'Новые сообщения от тренера ($unread)', to: '/chat'));
  }

  return out.where((_Notif n) => !dismissed.contains(n.id)).toList();
}

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _hadUnread = false;

  @override
  void dispose() {
    // Уход со страницы = «увидел новые сообщения» → отмечаем чат прочитанным.
    if (_hadUnread) ref.read(clientChatApiProvider).markRead();
    super.dispose();
  }

  /// Согласование занятия открывает шторку подтверждения прямо здесь (как в
  /// календаре), а не перебрасывает на страницу календаря. Если сессия не нашлась —
  /// падаем на обычную навигацию по `n.to`.
  void _openNotif(_Notif n, List<Session> sessions) {
    if (n.kind == _Kind.confirm && n.sessionId != null) {
      for (final Session s in sessions) {
        if (s.id == n.sessionId) {
          _showConfirmSheet(context, ref, s);
          return;
        }
      }
    }
    context.push(n.to);
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Session>> sessions = ref.watch(clientSessionsProvider);
    final AsyncValue<List<Workout>> workouts = ref.watch(clientWorkoutsProvider);
    final AsyncValue<List<ClientPackage>> packages = ref.watch(clientPackagesProvider);
    final AsyncValue<List<ClientMeasurementTask>> measureTasks = ref.watch(clientMeasurementTasksProvider);
    final AsyncValue<int> unread = ref.watch(clientUnreadProvider);
    final AsyncValue<ClientChatData> chat = ref.watch(clientChatProvider);
    final Set<String> dismissed = ref.watch(_dismissedProvider);
    if ((unread.valueOrNull ?? 0) > 0) _hadUnread = true;

    final List<_Notif> items = _build(
      sessions: sessions.valueOrNull ?? <Session>[],
      workouts: workouts.valueOrNull ?? <Workout>[],
      packages: packages.valueOrNull ?? <ClientPackage>[],
      measurementTasks: measureTasks.valueOrNull ?? <ClientMeasurementTask>[],
      unread: unread.valueOrNull ?? 0,
      dismissed: dismissed,
    );
    final List<ChatMessage> openTasks = (chat.valueOrNull?.messages ?? <ChatMessage>[])
        .where((ChatMessage m) => m.kind == MessageKind.task && m.taskDone != true)
        .toList();

    final bool loading = sessions.isLoading && workouts.isLoading;

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
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : (items.isEmpty && openTasks.isEmpty)
                      ? Center(child: Text('Уведомлений нет.', style: TextStyle(color: c.inkMuted)))
                      : RefreshIndicator(
                          onRefresh: () async {
                            ref.invalidate(clientSessionsProvider);
                            ref.invalidate(clientWorkoutsProvider);
                            ref.invalidate(clientPackagesProvider);
                            ref.invalidate(clientUnreadProvider);
                          },
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                            children: <Widget>[
                              ...openTasks.map((ChatMessage t) => _TaskCard(
                                    task: t,
                                    onComplete: () async {
                                      await ref.read(clientChatApiProvider).completeTask(t.id);
                                      ref.invalidate(clientChatProvider);
                                    },
                                  )),
                              ...items.map((_Notif n) => _NotifCard(
                                    notif: n,
                                    onTap: () => _openNotif(n, sessions.valueOrNull ?? <Session>[]),
                                    onDismiss: () => ref.read(_dismissedProvider.notifier).state =
                                        <String>{...dismissed, n.id},
                                  )),
                            ],
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({required this.task, required this.onComplete});
  final ChatMessage task;
  final VoidCallback onComplete;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.accent.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: <Widget>[
          GestureDetector(
            onTap: onComplete,
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: c.inkMuted, width: 2),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('ЗАДАЧА', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c.accent)),
                Text(task.body, style: TextStyle(fontSize: 14, color: c.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

void _showConfirmSheet(BuildContext context, WidgetRef ref, Session s) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.colors.bg,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _SessionSheet(session: s),
  );
}

/// Шторка занятия: дата/время/длительность, формат, заметка, статус и кнопки
/// «Подтвердить»/«Отклонить» (пока ждёт ответа и не отменено). Зеркало шторки из
/// календаря — клиент согласовывает занятие прямо из ленты уведомлений.
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

class _NotifCard extends StatelessWidget {
  const _NotifCard({required this.notif, required this.onTap, required this.onDismiss});
  final _Notif notif;
  final VoidCallback onTap;
  final VoidCallback onDismiss;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Dismissible(
      key: ValueKey<String>(notif.id),
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
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
          child: Row(
            children: <Widget>[
              Icon(_icon(notif.kind), size: 18, color: c.accent),
              const SizedBox(width: 12),
              Expanded(child: Text(notif.text, style: TextStyle(fontSize: 14, color: c.ink))),
            ],
          ),
        ),
      ),
    );
  }
}
