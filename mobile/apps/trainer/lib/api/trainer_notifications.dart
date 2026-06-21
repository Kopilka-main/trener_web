import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'trainer_calendar.dart';
import 'trainer_clients.dart';

/// Тип «требует действия» — зеркало веба (lib/notifications.ts: AlertType).
enum TrainerAlertType { cancelled, declined, onlineToday, noUpcoming }

/// Серьёзность — для цвета иконки (danger / warn), как в вебе.
enum TrainerAlertSeverity { danger, warn }

/// Уведомление «требует действия» тренера. id — СТАБИЛЬНЫЙ (переживает рефетч),
/// чтобы seen/dismissed работали между обновлениями данных и перезапусками.
class TrainerAlert {
  TrainerAlert({
    required this.id,
    required this.type,
    required this.severity,
    required this.clientId,
    required this.headline,
    required this.clientName,
    required this.message,
  });

  final String id;
  final TrainerAlertType type;
  final TrainerAlertSeverity severity;
  final String? clientId;
  final String headline;
  final String clientName;
  final String message;
}

const List<String> _ruMonthsShort = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

String _isoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// «3 июн, 14:30» / «3 июн» (как labelDate в вебе).
String _labelDate(String iso, String? time) {
  final List<String> p = iso.split('-');
  if (p.length != 3) return iso;
  final int m = int.tryParse(p[1]) ?? 0;
  final int d = int.tryParse(p[2]) ?? 0;
  if (m < 1 || m > 12 || d < 1) return iso;
  final String base = '$d ${_ruMonthsShort[m - 1]}';
  return (time != null && time.isNotEmpty) ? '$base, $time' : base;
}

/// Считает алерты «требует действия» тренера — ТОЧНО по веб-эталону
/// (buildNotifications в apps/web/src/lib/notifications.ts):
///  • cancelled — отменённые занятия в окне [−14 … +14];
///  • declined — клиент отклонил (не cancelled) в окне [−14 … +14];
///  • online_today — онлайн-занятие planned сегодня;
///  • no_upcoming — оплативший клиент без planned-занятий на [сегодня … +7].
/// paidClientIds — клиенты с положительным остатком пакетов (для no_upcoming).
List<TrainerAlert> buildTrainerAlerts({
  required List<Session> sessions,
  required List<Client> clients,
  required Set<String> paidClientIds,
  DateTime? nowOverride,
}) {
  final DateTime now = nowOverride ?? DateTime.now();
  final String today = _isoDate(now);
  final String in7 = _isoDate(now.add(const Duration(days: 7)));
  final String ago14 = _isoDate(now.subtract(const Duration(days: 14)));
  final String in14 = _isoDate(now.add(const Duration(days: 14)));

  final Map<String, String> nameById = <String, String>{
    for (final Client c in clients) c.id: c.fullName,
  };

  final List<TrainerAlert> alerts = <TrainerAlert>[];

  for (final Session s in sessions) {
    final String who = (nameById[s.clientId] ?? '').isNotEmpty
        ? nameById[s.clientId]!
        : (s.clientName.isNotEmpty ? s.clientName : 'Клиент');
    final String d = s.date;

    // Отмена занятия → переназначить/связаться.
    if (s.status == SessionStatus.cancelled && d.compareTo(ago14) >= 0 && d.compareTo(in14) <= 0) {
      alerts.add(TrainerAlert(
        id: 'al:cancel:${s.id}',
        type: TrainerAlertType.cancelled,
        severity: TrainerAlertSeverity.danger,
        clientId: s.clientId,
        headline: 'Занятие отменено',
        clientName: who,
        message: '${_labelDate(d, s.startTime)} — переназначьте или свяжитесь с клиентом',
      ));
    }

    // Клиент отклонил (не cancelled) → согласовать другое время.
    if (s.status != SessionStatus.cancelled &&
        s.confirmation == ClientConfirmation.declined &&
        d.compareTo(ago14) >= 0 &&
        d.compareTo(in14) <= 0) {
      alerts.add(TrainerAlert(
        id: 'al:declined:${s.id}',
        type: TrainerAlertType.declined,
        severity: TrainerAlertSeverity.danger,
        clientId: s.clientId,
        headline: 'Клиент отклонил занятие',
        clientName: who,
        message: '${_labelDate(d, s.startTime)} — согласуйте другое время',
      ));
    }

    // Онлайн-тренировка сегодня.
    if (s.status == SessionStatus.planned && s.isOnline && d == today) {
      alerts.add(TrainerAlert(
        id: 'al:online:${s.id}',
        type: TrainerAlertType.onlineToday,
        severity: TrainerAlertSeverity.warn,
        clientId: s.clientId,
        headline: 'Онлайн-тренировка сегодня',
        clientName: who,
        message: 'Сегодня в ${s.startTime}${s.title != null && s.title!.isNotEmpty ? ' · ${s.title}' : ''}',
      ));
    }
  }

  // Клиенты без planned-занятий на ближайшую неделю (только оплатившие).
  final Set<String> hasUpcoming = <String>{
    for (final Session s in sessions)
      if (s.status == SessionStatus.planned &&
          s.date.compareTo(today) >= 0 &&
          s.date.compareTo(in7) <= 0)
        s.clientId,
  };
  for (final Client c in clients) {
    if (paidClientIds.contains(c.id) && !hasUpcoming.contains(c.id)) {
      alerts.add(TrainerAlert(
        id: 'al:noup:${c.id}',
        type: TrainerAlertType.noUpcoming,
        severity: TrainerAlertSeverity.warn,
        clientId: c.id,
        headline: 'Нет занятий на неделю',
        clientName: c.fullName,
        message: 'Оплачены тренировки, но нет записи на ближайшие 7 дней',
      ));
    }
  }

  return alerts;
}

/// Состояние «увиденных» (для счётчика плитки) и «скрытых» (X в списке) алертов.
/// Зеркало веба: seen ≠ dismissed (см. notifications.md).
///  • seen — помечаются при заходе на /notifications; гасят счётчик плитки.
///    Новый алерт с другим id снова поднимет счётчик.
///  • dismissed — скрытые пользователем карточки (свайп), не показываются в списке.
/// Оба множества персистятся (LocalJsonStore), как localStorage в вебе.
class TrainerNotifState {
  const TrainerNotifState({required this.seen, required this.dismissed});
  final Set<String> seen;
  final Set<String> dismissed;

  TrainerNotifState copyWith({Set<String>? seen, Set<String>? dismissed}) =>
      TrainerNotifState(seen: seen ?? this.seen, dismissed: dismissed ?? this.dismissed);

  static const TrainerNotifState empty =
      TrainerNotifState(seen: <String>{}, dismissed: <String>{});
}

const String _seenKey = 'trainer_notifications_seen';
const String _dismissedKey = 'trainer_notifications_dismissed';

/// Notifier с синхронным чтением множеств (после гидрации из файла на старте).
class TrainerNotifNotifier extends Notifier<TrainerNotifState> {
  final LocalJsonStore _store = LocalJsonStore.instance;

  @override
  TrainerNotifState build() {
    // Гидратируем асинхронно; до загрузки — пустые множества (как localStorage,
    // которого ещё нет). Когда файл прочитан — обновим state.
    _hydrate();
    return TrainerNotifState.empty;
  }

  Future<void> _hydrate() async {
    final Set<String> seen = await _readSet(_seenKey);
    final Set<String> dismissed = await _readSet(_dismissedKey);
    state = TrainerNotifState(seen: seen, dismissed: dismissed);
  }

  Future<Set<String>> _readSet(String key) async {
    final List<Map<String, dynamic>>? raw = await _store.readList(key);
    if (raw == null) return <String>{};
    return <String>{
      for (final Map<String, dynamic> m in raw)
        if (m['id'] is String) m['id'] as String,
    };
  }

  Future<void> _writeSet(String key, Set<String> ids) =>
      _store.writeList(key, <Map<String, dynamic>>[for (final String id in ids) <String, dynamic>{'id': id}]);

  /// Пометить набор id «увиденными» (заход на экран уведомлений).
  void markSeen(Iterable<String> ids) {
    final Set<String> next = <String>{...state.seen, ...ids};
    if (next.length == state.seen.length) return;
    state = state.copyWith(seen: next);
    _writeSet(_seenKey, next);
  }

  /// Скрыть карточку (свайп).
  void dismiss(String id) {
    if (state.dismissed.contains(id)) return;
    final Set<String> next = <String>{...state.dismissed, id};
    state = state.copyWith(dismissed: next);
    _writeSet(_dismissedKey, next);
  }
}

final NotifierProvider<TrainerNotifNotifier, TrainerNotifState> trainerNotifProvider =
    NotifierProvider<TrainerNotifNotifier, TrainerNotifState>(TrainerNotifNotifier.new);

/// Источники алертов (сессии/клиенты/балансы) → список TrainerAlert БЕЗ скрытых.
/// Используется экраном уведомлений (показывает всё, кроме dismissed).
final Provider<List<TrainerAlert>> trainerAlertsProvider = Provider<List<TrainerAlert>>((ref) {
  final List<Session> sessions = ref.watch(trainerSessionsProvider).valueOrNull ?? <Session>[];
  final List<Client> clients = ref.watch(trainerClientsProvider).valueOrNull ?? <Client>[];
  final Map<String, num> balances = ref.watch(trainerBalancesProvider).valueOrNull ?? <String, num>{};
  final Set<String> paid = <String>{
    for (final MapEntry<String, num> e in balances.entries)
      if (e.value > 0) e.key,
  };
  return buildTrainerAlerts(sessions: sessions, clients: clients, paidClientIds: paid);
});

/// Видимые на ЭКРАНЕ алерты (минус скрытые свайпом).
final Provider<List<TrainerAlert>> trainerVisibleAlertsProvider =
    Provider<List<TrainerAlert>>((ref) {
  final List<TrainerAlert> all = ref.watch(trainerAlertsProvider);
  final Set<String> dismissed = ref.watch(trainerNotifProvider).dismissed;
  return all.where((TrainerAlert a) => !dismissed.contains(a.id)).toList();
});

/// Счётчик для ПЛИТКИ главной = алерты минус seen минус dismissed (новые задачи).
final Provider<int> trainerTileAlertsCountProvider = Provider<int>((ref) {
  final List<TrainerAlert> all = ref.watch(trainerAlertsProvider);
  final TrainerNotifState st = ref.watch(trainerNotifProvider);
  return all
      .where((TrainerAlert a) => !st.seen.contains(a.id) && !st.dismissed.contains(a.id))
      .length;
});
