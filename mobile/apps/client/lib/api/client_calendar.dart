import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Статус занятия (зеркало sessionStatusSchema из @trener/shared).
enum SessionStatus { planned, completed, cancelled, unknown }

/// Состояние подтверждения занятия клиентом (зеркало clientConfirmationSchema).
enum ClientConfirmation { pending, confirmed, declined, unknown }

SessionStatus _statusFrom(String? s) => switch (s) {
      'planned' => SessionStatus.planned,
      'completed' => SessionStatus.completed,
      'cancelled' => SessionStatus.cancelled,
      _ => SessionStatus.unknown,
    };

ClientConfirmation _confirmationFrom(String? s) => switch (s) {
      'pending' => ClientConfirmation.pending,
      'confirmed' => ClientConfirmation.confirmed,
      'declined' => ClientConfirmation.declined,
      _ => ClientConfirmation.unknown,
    };

/// Занятие клиента (зеркало sessionResponseSchema).
class Session {
  Session({
    required this.id,
    required this.workoutId,
    required this.date,
    required this.startTime,
    required this.durationMin,
    required this.location,
    required this.title,
    required this.status,
    required this.isOnline,
    required this.note,
    required this.confirmation,
  });

  final String id;
  final String? workoutId;
  final String date; // YYYY-MM-DD
  final String startTime; // HH:MM
  final int durationMin;
  final String? location;
  final String? title;
  final SessionStatus status;
  final bool isOnline;
  final String? note;
  final ClientConfirmation confirmation;

  factory Session.fromJson(Map<String, dynamic> j) {
    final String rawDate = j['date'] as String? ?? '';
    return Session(
        id: j['id'] as String? ?? '',
        workoutId: j['workoutId'] as String?,
        date: rawDate.length >= 10 ? rawDate.substring(0, 10) : rawDate,
        startTime: j['startTime'] as String? ?? '',
        durationMin: (j['durationMin'] as num?)?.toInt() ?? 60,
        location: j['location'] as String?,
        title: j['title'] as String?,
        status: _statusFrom(j['status'] as String?),
        isOnline: j['isOnline'] as bool? ?? false,
        note: j['note'] as String?,
        confirmation: _confirmationFrom(j['clientConfirmation'] as String?),
      );
  }

  /// Локальная дата-время начала. Сервер хранит дату и время в локали тренера/клиента;
  /// парсим без таймзоны (как стенные часы), чтобы не сдвигать на UTC.
  DateTime get start {
    final List<String> d = date.split('-');
    final List<String> t = startTime.split(':');
    if (d.length != 3 || t.length != 2) return DateTime(1970);
    return DateTime(
      int.tryParse(d[0]) ?? 1970,
      int.tryParse(d[1]) ?? 1,
      int.tryParse(d[2]) ?? 1,
      int.tryParse(t[0]) ?? 0,
      int.tryParse(t[1]) ?? 0,
    );
  }

  DateTime get end => start.add(Duration(minutes: durationMin));

  /// Нужно ли действие клиента: запланировано и ещё не подтверждено/отклонено.
  bool get needsAction =>
      status == SessionStatus.planned && confirmation == ClientConfirmation.pending;

  /// Проекция в общую модель календаря (core SessionsCalendar).
  CalSession toCal() => CalSession(
        id: id,
        date: date,
        startTime: startTime,
        durationMin: durationMin,
        isOnline: isOnline,
        location: location,
        label: title?.trim().isNotEmpty == true ? title! : 'Занятие',
        status: switch (status) {
          SessionStatus.completed => CalStatus.completed,
          SessionStatus.cancelled => CalStatus.cancelled,
          _ => CalStatus.planned,
        },
        confirmation: switch (confirmation) {
          ClientConfirmation.confirmed => CalConfirmation.confirmed,
          ClientConfirmation.declined => CalConfirmation.declined,
          _ => CalConfirmation.pending,
        },
      );
}

String _isoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Доступ к календарю клиента: список занятий в диапазоне + подтверждение/отклонение.
class ClientCalendarApi {
  ClientCalendarApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  /// Занятия за широкий диапазон (−60…+90 дней), фильтрация на клиенте.
  Future<List<Session>> load() async {
    final DateTime now = DateTime.now();
    final String from = _isoDate(now.subtract(const Duration(days: 120)));
    final String to = _isoDate(now.add(const Duration(days: 240)));
    final Map<String, dynamic> r = await _api.getJson('/api/client/sessions?from=$from&to=$to');
    final List<dynamic> raw = (r['sessions'] as List<dynamic>?) ?? <dynamic>[];
    final List<Session> list =
        raw.cast<Map<String, dynamic>>().map(Session.fromJson).toList();
    list.sort((Session a, Session b) => a.start.compareTo(b.start));
    return list;
  }

  /// Подтвердить или отклонить занятие.
  Future<void> confirm(String id, {required bool accept}) async {
    await _api.postJson(
      '/api/client/sessions/$id/confirmation',
      <String, String>{'status': accept ? 'confirmed' : 'declined'},
    );
  }
}

final Provider<ClientCalendarApi> clientCalendarApiProvider =
    Provider<ClientCalendarApi>((ref) => ClientCalendarApi(ref));

final FutureProvider<List<Session>> clientSessionsProvider =
    FutureProvider<List<Session>>((ref) => ref.read(clientCalendarApiProvider).load());
