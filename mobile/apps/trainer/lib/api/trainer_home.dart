import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Данные тренерской главной (срез метрик).
class HomeData {
  HomeData({
    required this.name,
    required this.todaySessions,
    required this.activeClients,
    required this.plannedSessions,
    required this.unread,
    required this.monthlyProfit,
    required this.knowledgeCount,
    required this.alerts,
  });

  final String name;
  final int todaySessions;
  final int activeClients;
  final int plannedSessions;
  final int unread;
  final num monthlyProfit;
  final int knowledgeCount;
  final int alerts; // событий, требующих внимания
}

String _isoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Сбор метрик тренерской главной. Каждый вызов устойчив к ошибке (метрика → 0).
class TrainerHomeApi {
  TrainerHomeApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<Map<String, dynamic>> _safe(String path) async {
    try {
      return await _api.getJson(path);
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  int _activeNonCancelled(Map<String, dynamic> res) =>
      ((res['sessions'] as List<dynamic>?) ?? <dynamic>[])
          .cast<Map<String, dynamic>>()
          .where((Map<String, dynamic> s) => s['status'] != 'cancelled')
          .length;

  Future<HomeData> load() async {
    final DateTime now = DateTime.now();
    final String today = _isoDate(now);
    final String in30 = _isoDate(now.add(const Duration(days: 30)));
    final String monthFrom = _isoDate(DateTime(now.year, now.month, 1));
    final String monthTo = _isoDate(DateTime(now.year, now.month + 1, 0));

    final List<Map<String, dynamic>> r = await Future.wait(<Future<Map<String, dynamic>>>[
      _safe('/api/auth/me'),
      _safe('/api/sessions?from=$today&to=$today'),
      _safe('/api/sessions?from=$today&to=$in30'),
      _safe('/api/clients'),
      _safe('/api/chat/unread'),
      _safe('/api/accounting/summary?from=$monthFrom&to=$monthTo'),
      _safe('/api/exercises'),
      _safe('/api/packages/balances'),
    ]);

    final Map<String, dynamic> me = (r[0]['trainer'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final List<Map<String, dynamic>> clients =
        ((r[3]['clients'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>();
    final int unread = (r[4]['count'] as num?)?.toInt() ?? 0;
    final String name = '${me['firstName'] ?? ''} ${me['lastName'] ?? ''}'.trim();
    final num profit = (r[5]['balance'] as num?) ?? 0;
    final int knowledge = ((r[6]['exercises'] as List<dynamic>?) ?? <dynamic>[]).length;

    // Алерты: отклонённые будущие занятия + активные клиенты с исчерпанным балансом.
    final List<Map<String, dynamic>> sessions30 =
        ((r[2]['sessions'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>();
    final int declined = sessions30
        .where((Map<String, dynamic> s) =>
            s['status'] == 'planned' && s['clientConfirmation'] == 'declined')
        .length;
    final Map<String, num> balances = <String, num>{
      for (final dynamic b in (r[7]['balances'] as List<dynamic>?) ?? <dynamic>[])
        ((b as Map<String, dynamic>)['clientId'] as String? ?? ''): (b['remaining'] as num?) ?? 0,
    };
    final int exhausted = clients
        .where((Map<String, dynamic> c) => c['status'] == 'active' && (balances[c['id']] ?? 0) <= 0)
        .length;

    return HomeData(
      name: name.isEmpty ? (me['email'] as String? ?? '') : name,
      todaySessions: _activeNonCancelled(r[1]),
      plannedSessions: _activeNonCancelled(r[2]),
      activeClients:
          clients.where((Map<String, dynamic> c) => c['status'] == 'active').length,
      unread: unread,
      monthlyProfit: profit,
      knowledgeCount: knowledge,
      alerts: declined + exhausted,
    );
  }
}

final Provider<TrainerHomeApi> trainerHomeApiProvider =
    Provider<TrainerHomeApi>((ref) => TrainerHomeApi(ref));

final FutureProvider<HomeData> trainerHomeProvider =
    FutureProvider<HomeData>((ref) => ref.read(trainerHomeApiProvider).load());
