import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_calendar.dart';
import '../api/trainer_clients.dart';
import '../api/trainer_workouts.dart';
import 'active_workout_screen.dart';
import 'clients_screen.dart' show ClientDetailScreen;
import 'session_form.dart';

/// Календарь тренера: SessionsCalendar (День/Неделя/Месяц) с именами клиентов +
/// шит занятия с подтверждением клиента и действиями «Провести»/«Отменить».
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key, this.clientId, this.clientName});

  /// Если задан — календарь показывает занятия только этого клиента, а форма
  /// создания занятия по умолчанию выбирает его (как в вебе).
  final String? clientId;
  final String? clientName;

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  @override
  void initState() {
    super.initState();
    // При открытии тянем свежие занятия — чтобы статус подтверждения клиента был
    // актуальным, даже если пуш не обновил кэш.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.invalidate(trainerSessionsProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final String? clientId = widget.clientId;
    final String? clientName = widget.clientName;
    final AsyncValue<List<Session>> sessions = ref.watch(trainerSessionsProvider);
    final AppColors c = context.colors;
    final bool scoped = clientId != null;

    return Scaffold(
      appBar: scoped ? AppBar(title: Text('Календарь · ${clientName ?? ''}')) : null,
      floatingActionButton: FloatingActionButton(
        onPressed: () => showSessionForm(context, ref, defaultClientId: clientId),
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (!scoped)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
                child: Text('Календарь', style: AppFonts.display(size: 24, color: c.ink)),
              ),
            Expanded(
              child: sessions.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (Object e, _) => _Retry(onRetry: () => ref.invalidate(trainerSessionsProvider)),
                data: (List<Session> raw) {
                  // Онлайн-занятия видны только в КЛИЕНТСКОМ календаре (scoped —
                  // все занятия этого клиента, включая онлайн). В ОБЩЕМ календаре
                  // тренера (с главной) онлайн скрыты — только очные занятия.
                  final List<Session> all = raw
                      .where((Session s) => scoped ? s.clientId == clientId : !s.isOnline)
                      .toList();
                  final Map<String, Session> byId = <String, Session>{for (final Session s in all) s.id: s};
                  return SessionsCalendar(
                    sessions: all.map((Session s) => s.toCal()).toList(),
                    defaultView: CalendarView.week,
                    onSessionTap: (CalSession cs) {
                      final Session? s = byId[cs.id];
                      if (s != null) _showSheet(context, ref, s);
                    },
                    onEmptyTap: (DateTime at) => showSessionForm(
                      context,
                      ref,
                      defaultDate: at,
                      defaultTime: TimeOfDay(hour: at.hour, minute: at.minute),
                      defaultClientId: clientId,
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

/// Метка привязанной к занятию тренировки (или «не запланирована»).
class _PlannedWorkout extends ConsumerWidget {
  const _PlannedWorkout({required this.session});
  final Session session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final String? wid = session.workoutId;
    final String label;
    if (wid == null) {
      label = 'Тренировка не запланирована';
    } else {
      final AsyncValue<Workout> w =
          ref.watch(trainerWorkoutProvider((clientId: session.clientId, wid: wid)));
      label = w.valueOrNull?.name ?? 'Тренировка';
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Row(
        children: <Widget>[
          Icon(wid == null ? Icons.fitness_center_outlined : Icons.fitness_center,
              size: 18, color: c.inkMuted),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('ТРЕНИРОВКА',
                    style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: wid == null ? c.inkMuted : c.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
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

  Future<void> _edit() async {
    final NavigatorState nav = Navigator.of(context);
    final bool changed = await showSessionForm(context, ref, session: widget.session);
    if (changed && mounted) nav.pop();
  }

  /// «Провести»: открываем проведение привязанной тренировки (по завершении бэкенд
  /// сам отметит занятие). Кнопка показывается только если тренировка привязана —
  /// «голой» смены статуса без проведения нет.
  Future<void> _conduct() async {
    final String? wid = widget.session.workoutId;
    if (wid == null) return;
    final NavigatorState nav = Navigator.of(context);
    await nav.push<void>(MaterialPageRoute<void>(
      builder: (_) => ActiveWorkoutScreen(clientId: widget.session.clientId, workoutId: wid),
    ));
    if (!mounted) return;
    ref.invalidate(trainerSessionsProvider);
    nav.pop(); // закрыть шит занятия
  }

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
          // Шапка: аватар + имя клиента (тап → карточка клиента).
          Builder(builder: (BuildContext _) {
            final Client? cl =
                s.clientId.isNotEmpty ? ref.watch(trainerClientProvider(s.clientId)).valueOrNull : null;
            final String name = (cl?.fullName.trim().isNotEmpty == true)
                ? cl!.fullName
                : (s.clientName.isNotEmpty ? s.clientName : 'Без клиента');
            final String base = ref.read(baseUrlProvider).replaceAll(RegExp(r'/$'), '');
            final String? avatarUrl =
                cl?.avatarFileId != null ? '$base/api/files/${cl!.avatarFileId}' : null;
            final bool canOpen = cl != null;
            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: canOpen
                  ? () {
                      final NavigatorState nav = Navigator.of(context);
                      nav.pop();
                      nav.push<void>(MaterialPageRoute<void>(
                          builder: (_) => ClientDetailScreen(client: cl)));
                    }
                  : null,
              child: Row(
                children: <Widget>[
                  AuthedAvatar(
                    url: avatarUrl,
                    token: ref.watch(sessionProvider).token,
                    initials: cl?.initials ?? '',
                    radius: 22,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
                        if (s.title?.trim().isNotEmpty == true)
                          Text(s.title!.trim(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 14, color: c.inkMuted)),
                      ],
                    ),
                  ),
                  if (canOpen) Icon(Icons.chevron_right, size: 22, color: c.inkMutedXl),
                ],
              ),
            );
          }),
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
          // Какая тренировка запланирована к занятию (или «не запланирована»).
          _PlannedWorkout(session: s),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
            child: Text(confLabel,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.inkMuted)),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy ? null : _edit,
            icon: const Icon(Icons.edit_outlined, size: 18),
            label: const Text('Изменить занятие'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          ),
          if (isPlanned) ...<Widget>[
            const SizedBox(height: 16),
            Row(
              children: <Widget>[
                // «Провести» — только если есть привязанная тренировка (открывает её
                // проведение). Без тренировки кнопки-статуса нет — остаётся «Отменить».
                if (s.workoutId != null) ...<Widget>[
                  Expanded(
                    child: FilledButton(
                      onPressed: _busy ? null : _conduct,
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: _busy
                          ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Провести'),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
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
