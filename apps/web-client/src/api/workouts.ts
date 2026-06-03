import {
  workoutListResponseSchema,
  workoutResponseSchema,
  type WorkoutResponse,
} from '@trener/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const workoutWrap = z.object({ workout: workoutResponseSchema });

export const clientWorkoutsQueryKey = ['client', 'workouts'] as const;
export const clientWorkoutQueryKey = (wid: string) => ['client', 'workouts', wid] as const;

/** Завершённые тренировки клиента (read-only результаты).
 * Клиент без привязки к тренеру (409 NOT_LINKED) → пустой список, не ошибка:
 * приложением можно пользоваться самостоятельно. */
export function useClientWorkouts() {
  return useQuery<WorkoutResponse[]>({
    queryKey: clientWorkoutsQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/workouts', { schema: workoutListResponseSchema });
        return r.workouts;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
  });
}

/** Деталь завершённой тренировки. */
export function useClientWorkout(wid: string) {
  return useQuery<WorkoutResponse>({
    queryKey: clientWorkoutQueryKey(wid),
    queryFn: () =>
      apiFetch(`/client/workouts/${wid}`, { schema: workoutWrap }).then((r) => r.workout),
    enabled: wid !== '',
  });
}
