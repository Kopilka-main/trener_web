import {
  workoutListResponseSchema,
  workoutResponseSchema,
  type WorkoutResponse,
} from '@trener/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './client';

const workoutWrap = z.object({ workout: workoutResponseSchema });

export const clientWorkoutsQueryKey = ['client', 'workouts'] as const;
export const clientWorkoutQueryKey = (wid: string) => ['client', 'workouts', wid] as const;

/** Завершённые тренировки клиента (read-only результаты). */
export function useClientWorkouts() {
  return useQuery<WorkoutResponse[]>({
    queryKey: clientWorkoutsQueryKey,
    queryFn: () =>
      apiFetch('/client/workouts', { schema: workoutListResponseSchema }).then((r) => r.workouts),
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
