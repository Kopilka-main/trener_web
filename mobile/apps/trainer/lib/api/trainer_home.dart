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
  });

  final String name;
  final int todaySessions;
  final int activeClients;
  final int plannedSessions;
  final int unread;
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

    final List<Map<String, dynamic>> r = await Future.wait(<Future<Map<String, dynamic>>>[
      _safe('/api/auth/me'),
      _safe('/api/sessions?from=$today&to=$today'),
      _safe('/api/sessions?from=$today&to=$in30'),
      _safe('/api/clients'),
      _safe('/api/chat/unread'),
    ]);

    final Map<String, dynamic> me = (r[0]['trainer'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final List<dynamic> clients = (r[3]['clients'] as List<dynamic>?) ?? <dynamic>[];
    final int unread = (r[4]['count'] as num?)?.toInt() ?? 0;
    final String name = '${me['firstName'] ?? ''} ${me['lastName'] ?? ''}'.trim();

    return HomeData(
      name: name.isEmpty ? (me['email'] as String? ?? '') : name,
      todaySessions: _activeNonCancelled(r[1]),
      plannedSessions: _activeNonCancelled(r[2]),
      activeClients:
          clients.cast<Map<String, dynamic>>().where((Map<String, dynamic> c) => c['status'] == 'active').length,
      unread: unread,
    );
  }
}

final Provider<TrainerHomeApi> trainerHomeApiProvider =
    Provider<TrainerHomeApi>((ref) => TrainerHomeApi(ref));

final FutureProvider<HomeData> trainerHomeProvider =
    FutureProvider<HomeData>((ref) => ref.read(trainerHomeApiProvider).load());
