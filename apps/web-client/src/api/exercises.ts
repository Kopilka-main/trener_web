import { exerciseListResponseSchema, type ExerciseResponse } from '@trener/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from './client';

export const clientExercisesQueryKey = ['client', 'exercises'] as const;

/** Каталог упражнений тренера (глобальные + личные), read-only.
 * Клиент без привязки к тренеру (409 NOT_LINKED) → пустой список, не ошибка. */
export function useClientExercises() {
  return useQuery<ExerciseResponse[]>({
    queryKey: clientExercisesQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/exercises', { schema: exerciseListResponseSchema });
        return r.exercises;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
  });
}
