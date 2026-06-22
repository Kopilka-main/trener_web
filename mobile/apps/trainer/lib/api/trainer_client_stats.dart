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

/// Сырые тренировки клиента (полные, с упражнениями/подходами). Кэшируется, чтобы
/// сводка и обзор по упражнениям не дублировали один и тот же запрос.
final FutureProviderFamily<List<Map<String, dynamic>>, String> clientWorkoutsRawProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>((ref, String clientId) async {
  final ApiClient api = ref.read(apiClientProvider);
  final Map<String, dynamic> r = await api.getJson('/api/clients/$clientId/workouts');
  return ((r['workouts'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>();
});

final FutureProviderFamily<ClientStatsData, String> clientStatsProvider =
    FutureProvider.family<ClientStatsData, String>((ref, String clientId) async {
  final List<Map<String, dynamic>> all = await ref.watch(clientWorkoutsRawProvider(clientId).future);
  return _compute(all);
});

/// Обзор по упражнениям (PR/тоннаж/тренд) для вкладки «Упражнения».
final FutureProviderFamily<List<ExerciseOverview>, String> clientExerciseOverviewProvider =
    FutureProvider.family<List<ExerciseOverview>, String>((ref, String clientId) async {
  final List<Map<String, dynamic>> all = await ref.watch(clientWorkoutsRawProvider(clientId).future);
  return aggregateExerciseOverview(all);
});

DateTime? _completedDate(Map<String, dynamic> w) {
  final String? s = (w['completedAt'] ?? w['startedAt']) as String?;
  return s != null ? DateTime.tryParse(s) : null;
}

// ─── Обзор по упражнениям (зеркало web aggregateExerciseOverview) ───

/// Сводка по одному упражнению из завершённых тренировок клиента.
class ExerciseOverview {
  ExerciseOverview({
    required this.exerciseId,
    required this.name,
    required this.isTimeBased,
    required this.maxWeightKg,
    required this.tonnageKg,
    required this.maxTimeSec,
    required this.totalTimeSec,
    required this.lastDate,
    required this.lastIsRecord,
  });
  final String exerciseId;
  final String name;
  final bool isTimeBased;
  final num? maxWeightKg;
  final int tonnageKg;
  final num? maxTimeSec;
  final int totalTimeSec;
  final DateTime? lastDate;
  final bool lastIsRecord;
}

class _ExAcc {
  _ExAcc(this.exerciseId, this.name);
  final String exerciseId;
  String name;
  num? maxWeightKg;
  double tonnageKg = 0;
  num? maxTimeSec;
  int totalTimeSec = 0;
  int weightSetCount = 0;
  int timeSetCount = 0;
  DateTime lastMs = DateTime.fromMillisecondsSinceEpoch(0);
  DateTime? lastDate;
  num? lastSessionMaxWeight;
  num? lastSessionMaxTime;
}

/// Обзор по упражнениям: для каждого PR (вес/время), тоннаж/суммарное время,
/// дата последней сессии и флаг «рекорд в последней сессии». Свежие выше.
List<ExerciseOverview> aggregateExerciseOverview(List<Map<String, dynamic>> workouts) {
  final List<Map<String, dynamic>> completed =
      workouts.where((Map<String, dynamic> w) => w['status'] == 'completed').toList()
        ..sort((a, b) => _completedAt(a).compareTo(_completedAt(b)));
  final Map<String, _ExAcc> byId = <String, _ExAcc>{};

  for (final Map<String, dynamic> w in completed) {
    final DateTime ms = _completedAt(w);
    for (final Map<String, dynamic> ex
        in ((w['exercises'] as List<dynamic>?) ?? const <dynamic>[]).cast<Map<String, dynamic>>()) {
      final String exId = ex['exerciseId'] as String? ?? '';
      final _ExAcc acc = byId.putIfAbsent(exId, () => _ExAcc(exId, ex['exerciseName'] as String? ?? 'Упражнение'));
      acc.name = ex['exerciseName'] as String? ?? acc.name;
      num? sessionMaxWeight;
      num? sessionMaxTime;
      bool touched = false;
      for (final Map<String, dynamic> s
          in ((ex['sets'] as List<dynamic>?) ?? const <dynamic>[]).cast<Map<String, dynamic>>()) {
        if (s['done'] != true) continue;
        final num? weight = _n(s['actualWeightKg']);
        final num? reps = _n(s['actualReps']);
        final num? time = _n(s['actualTimeSec']);
        if (weight != null) {
          touched = true;
          acc.weightSetCount += 1;
          if (acc.maxWeightKg == null || weight > acc.maxWeightKg!) acc.maxWeightKg = weight;
          if (sessionMaxWeight == null || weight > sessionMaxWeight) sessionMaxWeight = weight;
          if (reps != null) acc.tonnageKg += weight * reps;
        }
        if (time != null) {
          touched = true;
          acc.timeSetCount += 1;
          if (acc.maxTimeSec == null || time > acc.maxTimeSec!) acc.maxTimeSec = time;
          acc.totalTimeSec += time.toInt();
          if (sessionMaxTime == null || time > sessionMaxTime) sessionMaxTime = time;
        }
      }
      if (touched && !ms.isBefore(acc.lastMs)) {
        acc.lastMs = ms;
        acc.lastDate = _completedDate(w);
        acc.lastSessionMaxWeight = sessionMaxWeight;
        acc.lastSessionMaxTime = sessionMaxTime;
      }
    }
  }

  final List<ExerciseOverview> out = <ExerciseOverview>[];
  for (final _ExAcc acc in byId.values) {
    final bool isTimeBased = acc.timeSetCount > acc.weightSetCount;
    final bool lastIsRecord = isTimeBased
        ? (acc.lastSessionMaxTime != null && acc.lastSessionMaxTime! >= (acc.maxTimeSec ?? 0))
        : (acc.lastSessionMaxWeight != null && acc.lastSessionMaxWeight! >= (acc.maxWeightKg ?? 0));
    out.add(ExerciseOverview(
      exerciseId: acc.exerciseId,
      name: acc.name,
      isTimeBased: isTimeBased,
      maxWeightKg: acc.maxWeightKg,
      tonnageKg: acc.tonnageKg.round(),
      maxTimeSec: acc.maxTimeSec,
      totalTimeSec: acc.totalTimeSec,
      lastDate: acc.lastDate,
      lastIsRecord: lastIsRecord,
    ));
  }
  out.sort((ExerciseOverview a, ExerciseOverview b) => (b.lastDate ?? DateTime.fromMillisecondsSinceEpoch(0))
      .compareTo(a.lastDate ?? DateTime.fromMillisecondsSinceEpoch(0)));
  return out;
}

// ─── История одного упражнения (зеркало web aggregateExerciseHistory) ───

class ExerciseHistoryPoint {
  ExerciseHistoryPoint({
    required this.workoutId,
    required this.date,
    required this.totalSets,
    required this.maxWeightKg,
    required this.topReps,
    required this.tonnage,
    required this.maxTimeSec,
    required this.totalTimeSec,
  });
  final String workoutId;
  final DateTime? date;
  final int totalSets;
  final num? maxWeightKg;
  final num? topReps;
  final int tonnage;
  final num? maxTimeSec;
  final int totalTimeSec;
}

class ExerciseHistory {
  ExerciseHistory({required this.name, required this.isTimeBased, required this.points});
  final String name;
  final bool isTimeBased;
  final List<ExerciseHistoryPoint> points;
}

/// История одного упражнения по завершённым тренировкам (точки от старых к новым).
ExerciseHistory? aggregateExerciseHistory(List<Map<String, dynamic>> workouts, String exerciseId) {
  final List<Map<String, dynamic>> completed =
      workouts.where((Map<String, dynamic> w) => w['status'] == 'completed').toList()
        ..sort((a, b) => _completedAt(a).compareTo(_completedAt(b)));
  final List<ExerciseHistoryPoint> points = <ExerciseHistoryPoint>[];
  String name = '';
  int weightSetCount = 0;
  int timeSetCount = 0;

  for (final Map<String, dynamic> w in completed) {
    final DateTime? date = _completedDate(w);
    int totalSets = 0;
    num? maxWeightKg;
    num? topReps;
    double tonnage = 0;
    num? maxTimeSec;
    int totalTimeSec = 0;

    for (final Map<String, dynamic> ex
        in ((w['exercises'] as List<dynamic>?) ?? const <dynamic>[]).cast<Map<String, dynamic>>()) {
      if ((ex['exerciseId'] as String? ?? '') != exerciseId) continue;
      name = ex['exerciseName'] as String? ?? name;
      for (final Map<String, dynamic> s
          in ((ex['sets'] as List<dynamic>?) ?? const <dynamic>[]).cast<Map<String, dynamic>>()) {
        if (s['done'] != true) continue;
        totalSets += 1;
        final num? weight = _n(s['actualWeightKg']);
        final num? reps = _n(s['actualReps']);
        final num? time = _n(s['actualTimeSec']);
        if (weight != null) {
          weightSetCount += 1;
          if (maxWeightKg == null || weight > maxWeightKg) {
            maxWeightKg = weight;
            topReps = reps;
          } else if (weight == maxWeightKg && reps != null) {
            topReps = (topReps == null || reps > topReps) ? reps : topReps;
          }
          if (reps != null) tonnage += weight * reps;
        }
        if (time != null) {
          timeSetCount += 1;
          if (maxTimeSec == null || time > maxTimeSec) maxTimeSec = time;
          totalTimeSec += time.toInt();
        }
      }
    }

    if (totalSets > 0) {
      points.add(ExerciseHistoryPoint(
        workoutId: w['id'] as String? ?? '',
        date: date,
        totalSets: totalSets,
        maxWeightKg: maxWeightKg,
        topReps: topReps,
        tonnage: tonnage.round(),
        maxTimeSec: maxTimeSec,
        totalTimeSec: totalTimeSec,
      ));
    }
  }

  if (points.isEmpty) return null;
  return ExerciseHistory(name: name, isTimeBased: timeSetCount > weightSetCount, points: points);
}
