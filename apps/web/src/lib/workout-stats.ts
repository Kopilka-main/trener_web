import type { WorkoutResponse, WorkoutSetResponse } from '@trener/shared';

/** Сводная статистика клиента по завершённым тренировкам. */
export interface ClientWorkoutStats {
  /** Кол-во завершённых тренировок (status === 'completed'). */
  completedWorkouts: number;
  /**
   * Суммарный тоннаж, кг = Σ (actualWeightKg × actualReps) по выполненным
   * подходам, где заданы и вес, и повторы по факту. Подходы без фактических
   * значений в тоннаж не попадают (считаем только реально сделанную работу).
   */
  tonnageKg: number;
  /** Суммарное число выполненных подходов (done === true). */
  doneSets: number;
  /** Суммарное число фактических повторов по выполненным подходам. */
  totalReps: number;
  /** Средний RPE по тренировкам, где он задан; null — если нигде не задан. */
  avgRpe: number | null;
  /** Суммарное время тренировок, сек (Σ durationSec, где задано). */
  totalDurationSec: number;
}

/** Тоннаж одного подхода: учитывается только при наличии факта по весу и повторам. */
function setTonnage(set: WorkoutSetResponse): number {
  if (!set.done) return 0;
  if (set.actualWeightKg === null || set.actualReps === null) return 0;
  return set.actualWeightKg * set.actualReps;
}

/** Считает сводную статистику только по завершённым тренировкам. */
export function aggregateClientStats(workouts: WorkoutResponse[]): ClientWorkoutStats {
  const completed = workouts.filter((w) => w.status === 'completed');

  let tonnageKg = 0;
  let doneSets = 0;
  let totalReps = 0;
  let totalDurationSec = 0;
  let rpeSum = 0;
  let rpeCount = 0;

  for (const w of completed) {
    if (w.durationSec !== null) totalDurationSec += w.durationSec;
    if (w.rpe !== null) {
      rpeSum += w.rpe;
      rpeCount += 1;
    }
    for (const ex of w.exercises) {
      for (const set of ex.sets) {
        if (!set.done) continue;
        doneSets += 1;
        if (set.actualReps !== null) totalReps += set.actualReps;
        tonnageKg += setTonnage(set);
      }
    }
  }

  return {
    completedWorkouts: completed.length,
    tonnageKg: Math.round(tonnageKg),
    doneSets,
    totalReps,
    avgRpe: rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 10) / 10 : null,
    totalDurationSec,
  };
}

/** Тоннаж и кол-во выполненных подходов одной тренировки — для строки истории. */
export function workoutRowStats(workout: WorkoutResponse): { tonnageKg: number; doneSets: number } {
  let tonnageKg = 0;
  let doneSets = 0;
  for (const ex of workout.exercises) {
    for (const set of ex.sets) {
      if (!set.done) continue;
      doneSets += 1;
      tonnageKg += setTonnage(set);
    }
  }
  return { tonnageKg: Math.round(tonnageKg), doneSets };
}

/** Сводка по одному упражнению из завершённых тренировок клиента. */
export interface ExerciseOverview {
  exerciseId: string;
  name: string;
  /** Упражнение «на время» — если факт по подходам шёл по времени, а не по весу. */
  isTimeBased: boolean;
  /** Максимальный рабочий вес (PR), кг; null — если веса не было. */
  maxWeightKg: number | null;
  /** Суммарный тоннаж, кг (Σ actualWeightKg × actualReps по done-подходам). */
  tonnageKg: number;
  /** Максимальное время в подходе (PR), сек; null — если времени не было. */
  maxTimeSec: number | null;
  /** Суммарное время, сек (Σ actualTimeSec по done-подходам). */
  totalTimeSec: number;
  /** ISO-дата последней завершённой тренировки с этим упражнением; null — нет. */
  lastDate: string | null;
  /** Рекорд (по весу либо времени) установлен в самой последней сессии. */
  lastIsRecord: boolean;
}

interface ExerciseAcc {
  exerciseId: string;
  name: string;
  maxWeightKg: number | null;
  tonnageKg: number;
  maxTimeSec: number | null;
  totalTimeSec: number;
  weightSetCount: number;
  timeSetCount: number;
  lastMs: number;
  lastDate: string | null;
  /** Лучший вес в самой последней сессии. */
  lastSessionMaxWeight: number | null;
  /** Лучшее время в самой последней сессии. */
  lastSessionMaxTime: number | null;
}

function completedAtMs(w: WorkoutResponse): number {
  const raw = w.completedAt ?? w.startedAt;
  return raw ? Date.parse(raw) : 0;
}

/**
 * Считает обзор по упражнениям из завершённых тренировок клиента.
 * Для каждого упражнения: PR (вес или время), тоннаж/суммарное время,
 * дата последней сессии и флаг «рекорд установлен в последней сессии».
 * Сортировка результата — по дате последней сессии (свежие выше).
 */
export function aggregateExerciseOverview(workouts: WorkoutResponse[]): ExerciseOverview[] {
  const completed = workouts
    .filter((w) => w.status === 'completed')
    .slice()
    .sort((a, b) => completedAtMs(a) - completedAtMs(b)); // от старых к новым

  const byId = new Map<string, ExerciseAcc>();

  for (const w of completed) {
    const ms = completedAtMs(w);
    const date = w.completedAt ?? w.startedAt;
    for (const ex of w.exercises) {
      let acc = byId.get(ex.exerciseId);
      if (!acc) {
        acc = {
          exerciseId: ex.exerciseId,
          name: ex.exerciseName,
          maxWeightKg: null,
          tonnageKg: 0,
          maxTimeSec: null,
          totalTimeSec: 0,
          weightSetCount: 0,
          timeSetCount: 0,
          lastMs: 0,
          lastDate: null,
          lastSessionMaxWeight: null,
          lastSessionMaxTime: null,
        };
        byId.set(ex.exerciseId, acc);
      }
      acc.name = ex.exerciseName;

      let sessionMaxWeight: number | null = null;
      let sessionMaxTime: number | null = null;
      let touched = false;

      for (const set of ex.sets) {
        if (!set.done) continue;
        if (set.actualWeightKg !== null) {
          touched = true;
          acc.weightSetCount += 1;
          acc.maxWeightKg = Math.max(acc.maxWeightKg ?? 0, set.actualWeightKg);
          sessionMaxWeight = Math.max(sessionMaxWeight ?? 0, set.actualWeightKg);
          if (set.actualReps !== null) acc.tonnageKg += set.actualWeightKg * set.actualReps;
        }
        if (set.actualTimeSec !== null) {
          touched = true;
          acc.timeSetCount += 1;
          acc.maxTimeSec = Math.max(acc.maxTimeSec ?? 0, set.actualTimeSec);
          acc.totalTimeSec += set.actualTimeSec;
          sessionMaxTime = Math.max(sessionMaxTime ?? 0, set.actualTimeSec);
        }
      }

      if (touched && ms >= acc.lastMs) {
        acc.lastMs = ms;
        acc.lastDate = date ?? null;
        acc.lastSessionMaxWeight = sessionMaxWeight;
        acc.lastSessionMaxTime = sessionMaxTime;
      }
    }
  }

  const out: ExerciseOverview[] = [];
  for (const acc of byId.values()) {
    const isTimeBased = acc.timeSetCount > acc.weightSetCount;
    const lastIsRecord = isTimeBased
      ? acc.lastSessionMaxTime !== null && acc.lastSessionMaxTime >= (acc.maxTimeSec ?? 0)
      : acc.lastSessionMaxWeight !== null && acc.lastSessionMaxWeight >= (acc.maxWeightKg ?? 0);
    out.push({
      exerciseId: acc.exerciseId,
      name: acc.name,
      isTimeBased,
      maxWeightKg: acc.maxWeightKg,
      tonnageKg: Math.round(acc.tonnageKg),
      maxTimeSec: acc.maxTimeSec,
      totalTimeSec: acc.totalTimeSec,
      lastDate: acc.lastDate,
      lastIsRecord,
    });
  }

  out.sort((a, b) => {
    const am = a.lastDate ? Date.parse(a.lastDate) : 0;
    const bm = b.lastDate ? Date.parse(b.lastDate) : 0;
    return bm - am;
  });
  return out;
}
