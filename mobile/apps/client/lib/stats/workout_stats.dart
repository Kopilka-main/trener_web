import '../api/client_workouts.dart';

/// Сводная статистика клиента по завершённым тренировкам (зеркало aggregateClientStats).
class ClientStats {
  ClientStats({
    required this.completedWorkouts,
    required this.tonnageKg,
    required this.doneSets,
    required this.totalReps,
    required this.avgRpe,
    required this.totalDurationSec,
  });
  final int completedWorkouts;
  final int tonnageKg;
  final int doneSets;
  final int totalReps;
  final double? avgRpe;
  final int totalDurationSec;
}

num _setTonnage(WorkoutSet s) {
  if (!s.done || s.actualWeightKg == null || s.actualReps == null) return 0;
  return s.actualWeightKg! * s.actualReps!;
}

ClientStats aggregateClientStats(List<Workout> workouts) {
  final List<Workout> completed =
      workouts.where((Workout w) => w.status == WorkoutStatus.completed).toList();
  double tonnage = 0;
  int doneSets = 0;
  int totalReps = 0;
  int totalDuration = 0;
  double rpeSum = 0;
  int rpeCount = 0;
  for (final Workout w in completed) {
    if (w.durationSec != null) totalDuration += w.durationSec!;
    if (w.rpe != null) {
      rpeSum += w.rpe!;
      rpeCount += 1;
    }
    for (final WorkoutExercise ex in w.exercises) {
      for (final WorkoutSet s in ex.sets) {
        if (!s.done) continue;
        doneSets += 1;
        if (s.actualReps != null) totalReps += s.actualReps!.toInt();
        tonnage += _setTonnage(s);
      }
    }
  }
  return ClientStats(
    completedWorkouts: completed.length,
    tonnageKg: tonnage.round(),
    doneSets: doneSets,
    totalReps: totalReps,
    avgRpe: rpeCount > 0 ? (rpeSum / rpeCount * 10).round() / 10 : null,
    totalDurationSec: totalDuration,
  );
}

/// Сводка по одному упражнению (зеркало ExerciseOverview).
class ExerciseOverview {
  ExerciseOverview({
    required this.exerciseId,
    required this.name,
    required this.isTimeBased,
    required this.maxWeightKg,
    required this.tonnageKg,
    required this.maxTimeSec,
    required this.lastDate,
    required this.lastIsRecord,
  });
  final String exerciseId;
  final String name;
  final bool isTimeBased;
  final num? maxWeightKg;
  final int tonnageKg;
  final num? maxTimeSec;
  final DateTime? lastDate;
  final bool lastIsRecord;
}

DateTime _completedAt(Workout w) => w.completedAt ?? w.startedAt ?? DateTime.fromMillisecondsSinceEpoch(0);

/// Обзор по упражнениям из завершённых тренировок (PR, тоннаж, дата, рекорд в последней).
List<ExerciseOverview> aggregateExerciseOverview(List<Workout> workouts) {
  final List<Workout> completed = workouts.where((Workout w) => w.status == WorkoutStatus.completed).toList()
    ..sort((a, b) => _completedAt(a).compareTo(_completedAt(b)));

  final Map<String, _Acc> byId = <String, _Acc>{};
  for (final Workout w in completed) {
    final DateTime ms = _completedAt(w);
    for (final WorkoutExercise ex in w.exercises) {
      final _Acc acc = byId.putIfAbsent(ex.exerciseId, () => _Acc(ex.exerciseId, ex.name));
      acc.name = ex.name;
      num? sMaxW;
      num? sMaxT;
      bool touched = false;
      for (final WorkoutSet s in ex.sets) {
        if (!s.done) continue;
        if (s.actualWeightKg != null) {
          touched = true;
          acc.weightCount += 1;
          acc.maxWeight = (acc.maxWeight == null) ? s.actualWeightKg : (s.actualWeightKg! > acc.maxWeight! ? s.actualWeightKg : acc.maxWeight);
          sMaxW = (sMaxW == null || s.actualWeightKg! > sMaxW) ? s.actualWeightKg : sMaxW;
          if (s.actualReps != null) acc.tonnage += s.actualWeightKg! * s.actualReps!;
        }
        if (s.actualTimeSec != null) {
          touched = true;
          acc.timeCount += 1;
          acc.maxTime = (acc.maxTime == null) ? s.actualTimeSec : (s.actualTimeSec! > acc.maxTime! ? s.actualTimeSec : acc.maxTime);
          sMaxT = (sMaxT == null || s.actualTimeSec! > sMaxT) ? s.actualTimeSec : sMaxT;
        }
      }
      if (touched && !ms.isBefore(acc.lastMs)) {
        acc.lastMs = ms;
        acc.lastSessionMaxW = sMaxW;
        acc.lastSessionMaxT = sMaxT;
      }
    }
  }

  final List<ExerciseOverview> out = byId.values.map((_Acc a) {
    final bool timeBased = a.timeCount > a.weightCount;
    final bool record = timeBased
        ? (a.lastSessionMaxT != null && a.lastSessionMaxT! >= (a.maxTime ?? 0))
        : (a.lastSessionMaxW != null && a.lastSessionMaxW! >= (a.maxWeight ?? 0));
    return ExerciseOverview(
      exerciseId: a.exerciseId,
      name: a.name,
      isTimeBased: timeBased,
      maxWeightKg: a.maxWeight,
      tonnageKg: a.tonnage.round(),
      maxTimeSec: a.maxTime,
      lastDate: a.lastMs.millisecondsSinceEpoch == 0 ? null : a.lastMs,
      lastIsRecord: record,
    );
  }).toList()
    ..sort((a, b) => (b.lastDate ?? DateTime.fromMillisecondsSinceEpoch(0))
        .compareTo(a.lastDate ?? DateTime.fromMillisecondsSinceEpoch(0)));
  return out;
}

class _Acc {
  _Acc(this.exerciseId, this.name);
  final String exerciseId;
  String name;
  num? maxWeight;
  double tonnage = 0;
  num? maxTime;
  int weightCount = 0;
  int timeCount = 0;
  DateTime lastMs = DateTime.fromMillisecondsSinceEpoch(0);
  num? lastSessionMaxW;
  num? lastSessionMaxT;
}

/// Точка истории упражнения (одна сессия).
class ExerciseHistoryPoint {
  ExerciseHistoryPoint({
    required this.date,
    required this.totalSets,
    required this.maxWeightKg,
    required this.topReps,
    required this.tonnage,
    required this.maxTimeSec,
  });
  final DateTime? date;
  final int totalSets;
  final num? maxWeightKg;
  final num? topReps;
  final int tonnage;
  final num? maxTimeSec;
}

class ExerciseHistory {
  ExerciseHistory({required this.name, required this.isTimeBased, required this.points});
  final String name;
  final bool isTimeBased;
  final List<ExerciseHistoryPoint> points;
}

/// История одного упражнения по завершённым тренировкам (точки от старых к новым).
ExerciseHistory? aggregateExerciseHistory(List<Workout> workouts, String exerciseId) {
  final List<Workout> completed = workouts.where((Workout w) => w.status == WorkoutStatus.completed).toList()
    ..sort((a, b) => _completedAt(a).compareTo(_completedAt(b)));

  final List<ExerciseHistoryPoint> points = <ExerciseHistoryPoint>[];
  String name = '';
  int weightCount = 0;
  int timeCount = 0;

  for (final Workout w in completed) {
    int totalSets = 0;
    num? maxW;
    num? topReps;
    double tonnage = 0;
    num? maxT;
    for (final WorkoutExercise ex in w.exercises) {
      if (ex.exerciseId != exerciseId) continue;
      name = ex.name;
      for (final WorkoutSet s in ex.sets) {
        if (!s.done) continue;
        totalSets += 1;
        if (s.actualWeightKg != null) {
          weightCount += 1;
          if (maxW == null || s.actualWeightKg! > maxW) {
            maxW = s.actualWeightKg;
            topReps = s.actualReps;
          } else if (s.actualWeightKg == maxW && s.actualReps != null) {
            topReps = (topReps == null || s.actualReps! > topReps) ? s.actualReps : topReps;
          }
          if (s.actualReps != null) tonnage += s.actualWeightKg! * s.actualReps!;
        }
        if (s.actualTimeSec != null) {
          timeCount += 1;
          maxT = (maxT == null || s.actualTimeSec! > maxT) ? s.actualTimeSec : maxT;
        }
      }
    }
    if (totalSets > 0) {
      points.add(ExerciseHistoryPoint(
        date: w.completedAt ?? w.startedAt,
        totalSets: totalSets,
        maxWeightKg: maxW,
        topReps: topReps,
        tonnage: tonnage.round(),
        maxTimeSec: maxT,
      ));
    }
  }
  if (points.isEmpty) return null;
  return ExerciseHistory(name: name, isTimeBased: timeCount > weightCount, points: points);
}
