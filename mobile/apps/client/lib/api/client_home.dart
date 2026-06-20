import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Данные клиентской главной (срез метрик), собранные из нескольких эндпоинтов.
class HomeData {
  HomeData({
    required this.name,
    required this.paidBalance,
    required this.packageEndsAt,
    required this.completedWorkouts,
    required this.plannedSessions,
    required this.unread,
  });

  final String name;
  final int paidBalance;
  final String? packageEndsAt;
  final int completedWorkouts;
  final int plannedSessions;
  final int unread;
}

String _isoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

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
    final List<dynamic> packages = (r[1]['packages'] as List<dynamic>?) ?? <dynamic>[];
    final List<dynamic> workouts = (r[2]['workouts'] as List<dynamic>?) ?? <dynamic>[];
    final List<dynamic> sessions = (r[3]['sessions'] as List<dynamic>?) ?? <dynamic>[];
    final int unread = (r[4]['count'] as num?)?.toInt() ?? 0;

    final Iterable<Map<String, dynamic>> active =
        packages.cast<Map<String, dynamic>>().where((p) => p['status'] == 'active');
    final int paidLessons =
        active.fold<int>(0, (int a, Map<String, dynamic> p) => a + ((p['lessonsPaid'] as num?)?.toInt() ?? 0));
    final int completedTrainer = workouts.cast<Map<String, dynamic>>().where((Map<String, dynamic> w) =>
        w['status'] == 'completed' && w['createdByClient'] != true && w['excludedFromBalance'] != true).length;
    final List<String> ends = active
        .map((Map<String, dynamic> p) => p['endsAt'])
        .whereType<String>()
        .toList()
      ..sort();
    final String name = '${me['firstName'] ?? ''} ${me['lastName'] ?? ''}'.trim();

    return HomeData(
      name: name.isEmpty ? (me['email'] as String? ?? '') : name,
      paidBalance: paidLessons - completedTrainer,
      packageEndsAt: ends.isEmpty ? null : ends.last,
      completedWorkouts:
          workouts.cast<Map<String, dynamic>>().where((Map<String, dynamic> w) => w['status'] == 'completed').length,
      plannedSessions:
          sessions.cast<Map<String, dynamic>>().where((Map<String, dynamic> s) => s['status'] != 'cancelled').length,
      unread: unread,
    );
  }
}

final Provider<ClientHomeApi> clientHomeApiProvider =
    Provider<ClientHomeApi>((ref) => ClientHomeApi(ref));

final FutureProvider<HomeData> clientHomeProvider =
    FutureProvider<HomeData>((ref) => ref.read(clientHomeApiProvider).load());
