import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'client_workouts.dart';
import '../stats/workout_stats.dart';

/// Данные клиентской главной (срез метрик), собранные из нескольких эндпоинтов.
class HomeData {
  HomeData({
    required this.name,
    required this.linked,
    required this.paidBalance,
    required this.packageEndsAt,
    required this.completedWorkouts,
    required this.plannedSessions,
    required this.unread,
    required this.recordsCount,
    required this.knowledgeCount,
    required this.nextSessionAt,
    required this.nextSessionLabel,
  });

  final String name;
  final bool linked;
  final int paidBalance;
  final String? packageEndsAt;
  final int completedWorkouts;
  final int plannedSessions;
  final int unread;
  final int recordsCount;
  final int knowledgeCount;
  final DateTime? nextSessionAt;
  final String? nextSessionLabel;
}

String _isoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime _localStart(String date, String hhmm) {
  final List<String> d = date.split('-');
  final List<String> t = hhmm.split(':');
  if (d.length != 3) return DateTime(1970);
  return DateTime(
    int.tryParse(d[0]) ?? 1970,
    int.tryParse(d[1]) ?? 1,
    int.tryParse(d[2]) ?? 1,
    t.isNotEmpty ? int.tryParse(t[0]) ?? 0 : 0,
    t.length > 1 ? int.tryParse(t[1]) ?? 0 : 0,
  );
}

/// Сбор метрик клиентской главной. Каждый вызов устойчив к ошибке/409 (нет
/// тренера) — тогда соответствующая метрика просто пустая.
class ClientHomeApi {
  ClientHomeApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<Map<String, dynamic>> _safe(String path) async {
    try {
      return await _api.getJson(path);
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  Future<HomeData> load() async {
    final DateTime now = DateTime.now();
    final String from = _isoDate(now);
    final String to = _isoDate(now.add(const Duration(days: 30)));

    final List<Map<String, dynamic>> r = await Future.wait(<Future<Map<String, dynamic>>>[
      _safe('/api/client/auth/me'),
      _safe('/api/client/packages'),
      _safe('/api/client/workouts'),
      _safe('/api/client/sessions?from=$from&to=$to'),
      _safe('/api/client/chat/unread'),
    ]);

    final Map<String, dynamic> me = (r[0]['account'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final bool linked = r[0]['link'] != null;
    final List<dynamic> packages = (r[1]['packages'] as List<dynamic>?) ?? <dynamic>[];
    final List<dynamic> workoutsRaw = (r[2]['workouts'] as List<dynamic>?) ?? <dynamic>[];
    final List<dynamic> sessions = (r[3]['sessions'] as List<dynamic>?) ?? <dynamic>[];
    final int unread = (r[4]['count'] as num?)?.toInt() ?? 0;

    final Iterable<Map<String, dynamic>> active =
        packages.cast<Map<String, dynamic>>().where((p) => p['status'] == 'active');
    final int paidLessons =
        active.fold<int>(0, (int a, Map<String, dynamic> p) => a + ((p['lessonsPaid'] as num?)?.toInt() ?? 0));

    final List<Workout> workouts =
        workoutsRaw.cast<Map<String, dynamic>>().map(Workout.fromJson).toList();
    final int completedTrainer = workouts
        .where((Workout w) =>
            w.status == WorkoutStatus.completed && !w.createdByClient)
        .length;
    final int completedAll =
        workouts.where((Workout w) => w.status == WorkoutStatus.completed).length;

    final List<ExerciseOverview> overview = aggregateExerciseOverview(workouts);
    final int records = overview.where((ExerciseOverview e) => e.lastIsRecord).length;

    final List<String> ends = active
        .map((Map<String, dynamic> p) => p['endsAt'])
        .whereType<String>()
        .toList()
      ..sort();
    final String name = '${me['firstName'] ?? ''} ${me['lastName'] ?? ''}'.trim();

    // Ближайшее будущее не-отменённое занятие (для строки «след.»).
    final List<Map<String, dynamic>> future = sessions
        .cast<Map<String, dynamic>>()
        .where((Map<String, dynamic> s) =>
            s['status'] != 'cancelled' &&
            !_localStart(s['date'] as String? ?? '', s['startTime'] as String? ?? '').isBefore(now))
        .toList()
      ..sort((Map<String, dynamic> a, Map<String, dynamic> b) =>
          _localStart(a['date'] as String? ?? '', a['startTime'] as String? ?? '')
              .compareTo(_localStart(b['date'] as String? ?? '', b['startTime'] as String? ?? '')));
    final Map<String, dynamic>? next = future.isNotEmpty ? future.first : null;
    final DateTime? nextAt = next != null
        ? _localStart(next['date'] as String? ?? '', next['startTime'] as String? ?? '')
        : null;
    final String? nextLabel = next != null
        ? <String>[
            (next['startTime'] as String? ?? ''),
            if ((next['title'] as String?)?.trim().isNotEmpty == true) (next['title'] as String).trim(),
          ].join(' · ')
        : null;

    return HomeData(
      name: name.isEmpty ? (me['email'] as String? ?? '') : name,
      linked: linked,
      paidBalance: paidLessons - completedTrainer,
      packageEndsAt: ends.isEmpty ? null : ends.last,
      completedWorkouts: completedAll,
      plannedSessions:
          sessions.cast<Map<String, dynamic>>().where((Map<String, dynamic> s) => s['status'] != 'cancelled').length,
      unread: unread,
      recordsCount: records,
      knowledgeCount: overview.length,
      nextSessionAt: nextAt,
      nextSessionLabel: nextLabel,
    );
  }
}

final Provider<ClientHomeApi> clientHomeApiProvider =
    Provider<ClientHomeApi>((ref) => ClientHomeApi(ref));

final FutureProvider<HomeData> clientHomeProvider =
    FutureProvider<HomeData>((ref) => ref.read(clientHomeApiProvider).load());
