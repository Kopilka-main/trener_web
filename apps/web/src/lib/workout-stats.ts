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
