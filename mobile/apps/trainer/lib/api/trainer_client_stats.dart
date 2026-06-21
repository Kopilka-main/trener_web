import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Сводная статистика клиента (зеркало aggregateClientStats) + свежие рекорды —
/// считается прямо из полных тренировок клиента (/api/clients/:id/workouts).
class ClientStatsData {
  ClientStatsData({
    required this.completedWorkouts,
    required this.tonnageKg,
    required this.doneSets,
    required this.totalReps,
    required this.avgRpe,
    required this.totalDurationSec,
    required this.records,
  });
  final int completedWorkouts;
  final int tonnageKg;
  final int doneSets;
  final int totalReps;
  final double? avgRpe;
  final int totalDurationSec;
  final List<StatRecord> records;
}

class StatRecord {
  StatRecord({required this.name, required this.isTimeBased, required this.value});
  final String name;
  final bool isTimeBased;
  final num value;
}

num? _n(dynamic v) => v is num ? v : null;
DateTime _completedAt(Map<String, dynamic> w) {
  final String? s = (w['completedAt'] ?? w['startedAt']) as String?;
  return s != null ? (DateTime.tryParse(s) ?? DateTime.fromMillisecondsSinceEpoch(0)) : DateTime.fromMillisecondsSinceEpoch(0);
}

ClientStatsData _compute(List<Map<String, dynamic>> all) {
  final List<Map<String, dynamic>> completed =
      all.where((Map<String, dynamic> w) => w['status'] == 'completed').toList()
        ..sort((a, b) => _completedAt(a).compareTo(_completedAt(b)));

  double tonnage = 0;
  int doneSets = 0;
  int totalReps = 0;
  int totalDuration = 0;
  double rpeSum = 0;
  int rpeCount = 0;

  // Аккумулятор по упражнению для рекордов.
  final Map<String, _Acc> byId = <String, _Acc>{};

  for (final Map<String, dynamic> w in completed) {
    if (_n(w['durationSec']) != null) totalDuration += _n(w['durationSec'])!.toInt();
    if (_n(w['rpe']) != null) {
      rpeSum += _n(w['rpe'])!;
      rpeCount += 1;
    }
    final DateTime ms = _completedAt(w);
    for (final Map<String, dynamic> ex in ((w['exercises'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>()) {
      final String exId = ex['exerciseId'] as String? ?? '';
      final _Acc acc = byId.putIfAbsent(exId, () => _Acc(ex['exerciseName'] as String? ?? 'Упражнение'));
      acc.name = ex['exerciseName'] as String? ?? acc.name;
      num? sMaxW;
      num? sMaxT;
      bool touched = false;
      for (final Map<String, dynamic> s in ((ex['sets'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>()) {
        if (s['done'] != true) continue;
        doneSets += 1;
        final num? reps = _n(s['actualReps']);
        final num? weight = _n(s['actualWeightKg']);
        final num? time = _n(s['actualTimeSec']);
        if (reps != null) totalReps += reps.toInt();
        if (weight != null && reps != null) tonnage += weight * reps;
        if (weight != null) {
          touched = true;
          acc.weightCount += 1;
          acc.maxWeight = (acc.maxWeight == null || weight > acc.maxWeight!) ? weight : acc.maxWeight;
          sMaxW = (sMaxW == null || weight > sMaxW) ? weight : sMaxW;
        }
        if (time != null) {
          touched = true;
          acc.timeCount += 1;
          acc.maxTime = (acc.maxTime == null || time > acc.maxTime!) ? time : acc.maxTime;
          sMaxT = (sMaxT == null || time > sMaxT) ? time : sMaxT;
        }
      }
      if (touched && !ms.isBefore(acc.lastMs)) {
        acc.lastMs = ms;
        acc.lastSessionMaxW = sMaxW;
        acc.lastSessionMaxT = sMaxT;
      }
    }
  }

  final List<StatRecord> records = <StatRecord>[];
  for (final _Acc a in byId.values) {
    final bool timeBased = a.timeCount > a.weightCount;
    final bool isRecord = timeBased
        ? (a.lastSessionMaxT != null && a.lastSessionMaxT! >= (a.maxTime ?? 0))
        : (a.lastSessionMaxW != null && a.lastSessionMaxW! >= (a.maxWeight ?? 0));
    if (isRecord && (timeBased ? a.maxTime : a.maxWeight) != null) {
      records.add(StatRecord(name: a.name, isTimeBased: timeBased, value: timeBased ? a.maxTime! : a.maxWeight!));
    }
  }
  records.sort((StatRecord a, StatRecord b) => a.name.compareTo(b.name));

  return ClientStatsData(
    completedWorkouts: completed.length,
    tonnageKg: tonnage.round(),
    doneSets: doneSets,
    totalReps: totalReps,
    avgRpe: rpeCount > 0 ? (rpeSum / rpeCount * 10).round() / 10 : null,
    totalDurationSec: totalDuration,
    records: records,
  );
}

class _Acc {
  _Acc(this.name);
  String name;
  num? maxWeight;
  num? maxTime;
  int weightCount = 0;
  int timeCount = 0;
  DateTime lastMs = DateTime.fromMillisecondsSinceEpoch(0);
  num? lastSessionMaxW;
  num? lastSessionMaxT;
}

final FutureProviderFamily<ClientStatsData, String> clientStatsProvider =
    FutureProvider.family<ClientStatsData, String>((ref, String clientId) async {
  final ApiClient api = ref.read(apiClientProvider);
  final Map<String, dynamic> r = await api.getJson('/api/clients/$clientId/workouts');
  final List<Map<String, dynamic>> all =
      ((r['workouts'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>();
  return _compute(all);
});
