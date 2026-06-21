import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Данные тренерской главной (срез метрик). Онлайн-занятия исключены из
/// календарных метрик (как в вебе).
class HomeData {
  HomeData({
    required this.name,
    required this.todaySessions,
    required this.activeClients,
    required this.plannedSessions,
    required this.unread,
    required this.monthlyProfit,
    required this.knowledgeCount,
    required this.nextAt,
    required this.nextTime,
    required this.nextName,
    required this.nextTitle,
    required this.nextClientId,
  });

  final String name;
  final int todaySessions;
  final int activeClients;
  final int plannedSessions;
  final int unread;
  final num monthlyProfit;
  final int knowledgeCount;
  // Ближайшее офлайн-занятие (не-cancelled, время ≥ сейчас).
  final DateTime? nextAt;
  final String nextTime;
  final String? nextName;
  final String? nextTitle;
  final String? nextClientId;
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

  Future<HomeData> load() async {
    final DateTime now = DateTime.now();
    final String today = _isoDate(now);
    final String in30 = _isoDate(now.add(const Duration(days: 30)));
    final String monthFrom = _isoDate(DateTime(now.year, now.month, 1));
    final String monthTo = _isoDate(DateTime(now.year, now.month + 1, 0));
    final String nowHHMM =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    final List<Map<String, dynamic>> r = await Future.wait(<Future<Map<String, dynamic>>>[
      _safe('/api/auth/me'),
      _safe('/api/sessions?from=$today&to=$in30'),
      _safe('/api/clients'),
      _safe('/api/chat/unread'),
      _safe('/api/accounting/summary?from=$monthFrom&to=$monthTo'),
      _safe('/api/exercises'),
    ]);

    final Map<String, dynamic> me = (r[0]['trainer'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final List<Map<String, dynamic>> clients =
        ((r[2]['clients'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>();
    final int unread = (r[3]['count'] as num?)?.toInt() ?? 0;
    final String name = '${me['firstName'] ?? ''} ${me['lastName'] ?? ''}'.trim();
    final num profit = (r[4]['balance'] as num?) ?? 0;
    final int knowledge = ((r[5]['exercises'] as List<dynamic>?) ?? <dynamic>[]).length;

    final Map<String, String> clientNames = <String, String>{
      for (final Map<String, dynamic> c in clients)
        (c['id'] as String? ?? ''): _shortName(c),
    };

    // Только офлайн-занятия (как в тренерском календаре).
    final List<Map<String, dynamic>> sessions =
        ((r[1]['sessions'] as List<dynamic>?) ?? <dynamic>[])
            .cast<Map<String, dynamic>>()
            .where((Map<String, dynamic> s) => (s['isOnline'] as bool? ?? false) == false)
            .toList();

    String sDate(Map<String, dynamic> s) => (s['date'] as String? ?? '').substring(0, 10.clamp(0, (s['date'] as String? ?? '').length));
    String sTime(Map<String, dynamic> s) => s['startTime'] as String? ?? '';

    // Сегодня: planned, дата = сегодня, время ≥ сейчас.
    final int todayCount = sessions
        .where((Map<String, dynamic> s) =>
            s['status'] == 'planned' && sDate(s) == today && sTime(s).compareTo(nowHHMM) >= 0)
        .length;

    // Календарь: не-cancelled на 30 дней.
    final int planned30 = sessions.where((Map<String, dynamic> s) => s['status'] != 'cancelled').length;

    // Ближайшее: не-cancelled, (date>today) || (date==today && time>=now).
    Map<String, dynamic>? next;
    for (final Map<String, dynamic> s in sessions) {
      if (s['status'] == 'cancelled') continue;
      final String d = sDate(s);
      final bool future = d.compareTo(today) > 0 || (d == today && sTime(s).compareTo(nowHHMM) >= 0);
      if (!future) continue;
      if (next == null ||
          d.compareTo(sDate(next)) < 0 ||
          (d == sDate(next) && sTime(s).compareTo(sTime(next)) < 0)) {
        next = s;
      }
    }
    DateTime? nextAt;
    if (next != null) {
      final List<String> dp = sDate(next).split('-');
      final List<String> tp = sTime(next).split(':');
      if (dp.length == 3 && tp.length == 2) {
        nextAt = DateTime(int.parse(dp[0]), int.parse(dp[1]), int.parse(dp[2]),
            int.tryParse(tp[0]) ?? 0, int.tryParse(tp[1]) ?? 0);
      }
    }

    // Счётчик плитки «Уведомления» считается отдельно (trainer_notifications.dart),
    // с учётом seen/dismissed и точных окон дат — как в вебе. Здесь не дублируем.

    return HomeData(
      name: name.isEmpty ? (me['email'] as String? ?? '') : name,
      todaySessions: todayCount,
      plannedSessions: planned30,
      activeClients: clients.where((Map<String, dynamic> c) => c['status'] == 'active').length,
      unread: unread,
      monthlyProfit: profit,
      knowledgeCount: knowledge,
      nextAt: nextAt,
      nextTime: next != null ? sTime(next) : '',
      nextName: next != null ? clientNames[next['clientId']] : null,
      nextTitle: next != null ? next['title'] as String? : null,
      nextClientId: next != null ? next['clientId'] as String? : null,
    );
  }

  static String _shortName(Map<String, dynamic> c) {
    final String first = c['firstName'] as String? ?? '';
    final String last = c['lastName'] as String? ?? '';
    final String li = last.isNotEmpty ? '${last.substring(0, 1)}.' : '';
    return '$first $li'.trim();
  }
}

final Provider<TrainerHomeApi> trainerHomeApiProvider =
    Provider<TrainerHomeApi>((ref) => TrainerHomeApi(ref));

final FutureProvider<HomeData> trainerHomeProvider =
    FutureProvider<HomeData>((ref) => ref.read(trainerHomeApiProvider).load());
