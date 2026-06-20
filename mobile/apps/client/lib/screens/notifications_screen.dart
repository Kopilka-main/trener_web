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

enum _Kind { confirm, soon, chat, package, workout, measure }

class _Notif {
  _Notif({required this.id, required this.kind, required this.text, required this.to});
  final String id;
  final _Kind kind;
  final String text;
  final String to;
}

IconData _icon(_Kind k) => switch (k) {
      _Kind.confirm => Icons.event_available_outlined,
      _Kind.soon => Icons.schedule_outlined,
      _Kind.chat => Icons.chat_bubble_outline,
      _Kind.package => Icons.account_balance_wallet_outlined,
      _Kind.workout => Icons.fitness_center,
      _Kind.measure => Icons.straighten,
    };

/// Отброшенные уведомления (в памяти сессии).
final StateProvider<Set<String>> _dismissedProvider = StateProvider<Set<String>>((_) => <String>{});

String _whenLabel(Session s) {
  final DateTime d = calParseIso(s.date);
  return '${d.day} ${_ruMonths[d.month - 1]}, ${s.startTime}';
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
      to: '/progress',
    ));
  }

  final List<Session> future = sessions
      .where((Session s) => s.status != SessionStatus.cancelled && !s.start.isBefore(now))
      .toList()
    ..sort((Session a, Session b) => a.start.compareTo(b.start));

  for (final Session s in future) {
    if (s.confirmation == ClientConfirmation.pending) {
      out.add(_Notif(id: 'confirm:${s.id}', kind: _Kind.confirm, text: 'Подтвердите занятие ${_whenLabel(s)}', to: '/calendar'));
    }
  }

  // Проведённые, но не согласованные за 30 дней.
  final DateTime ago30 = now.subtract(const Duration(days: 30));
  for (final Session s in sessions) {
    if (s.status != SessionStatus.completed || s.confirmation != ClientConfirmation.pending) continue;
    if (!s.start.isBefore(now) || s.start.isBefore(ago30)) continue;
    out.add(_Notif(id: 'confirm:${s.id}', kind: _Kind.confirm, text: 'Подтвердите проведённую тренировку ${_whenLabel(s)}', to: '/calendar'));
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
                                    onTap: () => context.push(n.to),
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
