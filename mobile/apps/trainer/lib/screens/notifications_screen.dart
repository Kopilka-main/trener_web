import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_calendar.dart';
import '../api/trainer_clients.dart';

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

enum _Kind { declined, today, pending, confirmed, birthday, lowBalance }

class _Item {
  _Item(this.kind, this.title, this.message, this.route);
  final _Kind kind;
  final String title;
  final String message;
  final String route; // куда ведёт тап
}

IconData _icon(_Kind k) => switch (k) {
      _Kind.declined => Icons.event_busy_outlined,
      _Kind.today => Icons.today_outlined,
      _Kind.pending => Icons.hourglass_empty,
      _Kind.confirmed => Icons.event_available_outlined,
      _Kind.birthday => Icons.cake_outlined,
      _Kind.lowBalance => Icons.account_balance_wallet_outlined,
    };

bool _isAlert(_Kind k) => k == _Kind.declined || k == _Kind.lowBalance;

/// Уведомления тренера: actionable-события по занятиям (отклонённые → переназначить,
/// сегодня, ждут подтверждения, подтверждённые), дни рождения клиентов и
/// исчерпанные балансы абонементов. Зеркало actionable-части веба.
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
                  final List<Client> clients = ref.watch(trainerClientsProvider).valueOrNull ?? <Client>[];
                  final Map<String, num> balances = ref.watch(trainerBalancesProvider).valueOrNull ?? <String, num>{};
                  final List<_Item> items = <_Item>[];

                  // Отклонённые будущие — требуют переназначения.
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned &&
                        s.confirmation == ClientConfirmation.declined &&
                        !s.start.isBefore(now)) {
                      items.add(_Item(_Kind.declined, s.clientName,
                          '${_when(s)} — клиент отклонил, переназначьте', '/calendar'));
                    }
                  }
                  // Исчерпанные балансы активных клиентов — продать абонемент.
                  for (final Client cl in clients) {
                    if (cl.status != ClientStatus.archived && (balances[cl.id] ?? 0) <= 0) {
                      items.add(_Item(_Kind.lowBalance, cl.fullName,
                          'Абонемент закончился — продайте новый', '/clients'));
                    }
                  }
                  // Сегодняшние занятия.
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned && _sameDay(s.start, now) && !s.start.isBefore(now)) {
                      items.add(_Item(_Kind.today, s.clientName, 'Сегодня в ${s.startTime}', '/calendar'));
                    }
                  }
                  // Дни рождения (сегодня и в ближайшую неделю).
                  for (final Client cl in clients) {
                    final int? d = _daysToBirthday(cl.birthDate, now);
                    if (d != null && d <= 7) {
                      items.add(_Item(_Kind.birthday, cl.fullName,
                          d == 0 ? 'Сегодня день рождения 🎉' : 'День рождения через $d дн.', '/clients'));
                    }
                  }
                  // Ждут подтверждения (будущие, pending).
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned &&
                        s.confirmation == ClientConfirmation.pending &&
                        !s.start.isBefore(now)) {
                      items.add(_Item(_Kind.pending, s.clientName, '${_when(s)} — ждёт подтверждения', '/calendar'));
                    }
                  }
                  // Недавно подтверждённые будущие.
                  for (final Session s in all) {
                    if (s.status == SessionStatus.planned &&
                        s.confirmation == ClientConfirmation.confirmed &&
                        !s.start.isBefore(now)) {
                      items.add(_Item(_Kind.confirmed, s.clientName, '${_when(s)} — клиент подтвердил', '/calendar'));
                    }
                  }

                  if (items.isEmpty) {
                    return Center(child: Text('Уведомлений нет', style: TextStyle(color: c.inkMuted)));
                  }
                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(trainerSessionsProvider);
                      ref.invalidate(trainerClientsProvider);
                      ref.invalidate(trainerBalancesProvider);
                    },
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      itemCount: items.length,
                      itemBuilder: (BuildContext ctx, int i) {
                        final _Item it = items[i];
                        return GestureDetector(
                          onTap: () => context.push(it.route),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
                            child: Row(
                              children: <Widget>[
                                Icon(_icon(it.kind),
                                    size: 18, color: _isAlert(it.kind) ? c.danger : c.accent),
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
