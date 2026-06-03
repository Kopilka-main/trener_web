import type { WorkoutResponse } from '@trener/shared';

/** Стабильный ключ подхода для пометки рекордов. */
export function setKey(workoutId: string, position: number, setIndex: number): string {
  return `${workoutId}:${position}:${setIndex}`;
}

type Best = { key: string; weight: number; reps: number; time: number };

/**
 * По всем завершённым тренировкам находит «рекордный» подход каждого упражнения:
 * максимум по весу, при равенстве — по повторам, затем по времени. Подходы без
 * фактических значений игнорируются. Возвращает множество ключей-рекордов.
 */
export function computeRecordKeys(workouts: WorkoutResponse[]): Set<string> {
  const bestByExercise = new Map<string, Best>();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        const weight = s.actualWeightKg;
        const reps = s.actualReps;
        const time = s.actualTimeSec;
        if (weight === null && reps === null && time === null) continue;
        const cand: Best = {
          key: setKey(w.id, ex.position, s.setIndex),
          weight: weight ?? 0,
          reps: reps ?? 0,
          time: time ?? 0,
        };
        const cur = bestByExercise.get(ex.exerciseId);
        if (
          !cur ||
          cand.weight > cur.weight ||
          (cand.weight === cur.weight && cand.reps > cur.reps) ||
          (cand.weight === cur.weight && cand.reps === cur.reps && cand.time > cur.time)
        ) {
          bestByExercise.set(ex.exerciseId, cand);
        }
      }
    }
  }
  return new Set([...bestByExercise.values()].map((b) => b.key));
}
