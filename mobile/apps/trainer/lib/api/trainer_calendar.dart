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

/// Занятие в тренерском календаре (зеркало sessionResponseSchema + имя клиента).
class Session {
  Session({
    required this.id,
    required this.clientId,
    required this.clientName,
    required this.date,
    required this.startTime,
    required this.durationMin,
    required this.location,
    required this.title,
    required this.status,
    required this.isOnline,
    required this.note,
    required this.confirmation,
    required this.workoutId,
  });

  final String id;
  final String clientId;
  final String clientName;
  final String date; // YYYY-MM-DD
  final String startTime; // HH:MM
  final int durationMin;
  final String? location;
  final String? title;
  final SessionStatus status;
  final bool isOnline;
  final String? note;
  final ClientConfirmation confirmation;
  final String? workoutId;

  factory Session.fromJson(Map<String, dynamic> j, Map<String, String> names) {
    final String rawDate = j['date'] as String? ?? '';
    final String cid = j['clientId'] as String? ?? '';
    return Session(
      id: j['id'] as String? ?? '',
      clientId: cid,
      clientName: names[cid] ?? 'Без клиента',
      date: rawDate.length >= 10 ? rawDate.substring(0, 10) : rawDate,
      startTime: j['startTime'] as String? ?? '',
      durationMin: (j['durationMin'] as num?)?.toInt() ?? 60,
      location: j['location'] as String?,
      title: j['title'] as String?,
      status: _statusFrom(j['status'] as String?),
      isOnline: j['isOnline'] as bool? ?? false,
      note: j['note'] as String?,
      confirmation: _confirmationFrom(j['clientConfirmation'] as String?),
      workoutId: j['workoutId'] as String?,
    );
  }

  /// Локальная дата-время начала (как стенные часы, без сдвига на UTC).
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

  /// Проекция в общую модель календаря: подпись = имя клиента (как в вебе тренера).
  CalSession toCal() => CalSession(
        id: id,
        date: date,
        startTime: startTime,
        durationMin: durationMin,
        isOnline: isOnline,
        location: location,
        label: clientName.isNotEmpty
            ? clientName
            : (title?.trim().isNotEmpty == true ? title! : 'Занятие'),
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

/// Доступ к тренерскому календарю: список занятий с именами клиентов + смена статуса.
class TrainerCalendarApi {
  TrainerCalendarApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  /// Занятия за широкий диапазон (−60…+90 дней) с подставленными именами клиентов.
  Future<List<Session>> load() async {
    final DateTime now = DateTime.now();
    final String from = _isoDate(now.subtract(const Duration(days: 120)));
    final String to = _isoDate(now.add(const Duration(days: 240)));

    final List<Map<String, dynamic>> r = await Future.wait(<Future<Map<String, dynamic>>>[
      _api.getJson('/api/sessions?from=$from&to=$to'),
      _api.getJson('/api/clients'),
    ]);

    final List<dynamic> clients = (r[1]['clients'] as List<dynamic>?) ?? <dynamic>[];
    final Map<String, String> names = <String, String>{
      for (final Map<String, dynamic> c in clients.cast<Map<String, dynamic>>())
        (c['id'] as String? ?? ''):
            '${c['firstName'] ?? ''} ${c['lastName'] ?? ''}'.trim(),
    };

    final List<dynamic> raw = (r[0]['sessions'] as List<dynamic>?) ?? <dynamic>[];
    final List<Session> list = raw
        .cast<Map<String, dynamic>>()
        .map((Map<String, dynamic> j) => Session.fromJson(j, names))
        .toList();
    list.sort((Session a, Session b) => a.start.compareTo(b.start));
    return list;
  }

  /// Сменить статус занятия (провести/отменить/вернуть в план).
  Future<void> setStatus(String id, SessionStatus status) async {
    await _api.patchJson('/api/sessions/$id', <String, String>{'status': _statusStr(status)});
  }

  /// Создать занятие. clientId опционален (можно блок без клиента).
  Future<void> create({
    String? clientId,
    required String date,
    required String startTime,
    required int durationMin,
    String? title,
    String? location,
    required bool isOnline,
    String? workoutId,
  }) async {
    await _api.postJson('/api/sessions', <String, dynamic>{
      'clientId': ?clientId,
      'date': date,
      'startTime': startTime,
      'durationMin': durationMin,
      'title': ?_nullIfEmpty(title),
      'location': ?_nullIfEmpty(location),
      'isOnline': isOnline,
      'workoutId': ?workoutId,
    });
  }

  /// Обновить занятие (частично). Передаём только нужные поля.
  Future<void> update(
    String id, {
    String? clientId,
    String? date,
    String? startTime,
    int? durationMin,
    String? title,
    String? location,
    bool? isOnline,
    SessionStatus? status,
    bool setWorkout = false,
    String? workoutId,
  }) async {
    await _api.patchJson('/api/sessions/$id', <String, dynamic>{
      'clientId': ?clientId,
      'date': ?date,
      'startTime': ?startTime,
      'durationMin': ?durationMin,
      // title/location могут стать пустыми — шлём явно (null допустим).
      if (title != null) 'title': title.trim().isEmpty ? null : title.trim(),
      if (location != null) 'location': location.trim().isEmpty ? null : location.trim(),
      'isOnline': ?isOnline,
      if (status != null) 'status': _statusStr(status),
      // setWorkout=true → шлём workoutId явно (null = отвязать).
      if (setWorkout) 'workoutId': workoutId,
    });
  }

  Future<void> delete(String id) async {
    await _api.deleteJson('/api/sessions/$id');
  }

  static String _statusStr(SessionStatus s) => switch (s) {
        SessionStatus.completed => 'completed',
        SessionStatus.cancelled => 'cancelled',
        _ => 'planned',
      };

  static String? _nullIfEmpty(String? s) => (s == null || s.trim().isEmpty) ? null : s.trim();
}

final Provider<TrainerCalendarApi> trainerCalendarApiProvider =
    Provider<TrainerCalendarApi>((ref) => TrainerCalendarApi(ref));

final FutureProvider<List<Session>> trainerSessionsProvider =
    FutureProvider<List<Session>>((ref) => ref.read(trainerCalendarApiProvider).load());
