import {
  completeWorkoutRequestSchema,
  createWorkoutRequestSchema,
  updateSetRequestSchema,
  workoutListResponseSchema,
  workoutResponseSchema,
  type CompleteWorkoutRequest,
  type CreateWorkoutRequest,
  type UpdateSetRequest,
  type WorkoutResponse,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const workoutWrap = z.object({ workout: workoutResponseSchema });
const okWrap = z.object({ ok: z.boolean() });

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

/** Деталь своей/завершённой тренировки. */
export function useClientWorkout(wid: string) {
  return useQuery<WorkoutResponse>({
    queryKey: clientWorkoutQueryKey(wid),
    queryFn: () =>
      apiFetch(`/client/workouts/${wid}`, { schema: workoutWrap }).then((r) => r.workout),
    enabled: wid !== '',
  });
}

/** Инвалидация общего префикса ['client','workouts'] покрывает и список, и деталь,
 * и производные данные (прогресс/база знаний берут из того же useClientWorkouts). */
function useInvalidateWorkouts() {
  const qc = useQueryClient();
  return (wid?: string) => {
    void qc.invalidateQueries({ queryKey: clientWorkoutsQueryKey });
    if (wid !== undefined) void qc.invalidateQueries({ queryKey: clientWorkoutQueryKey(wid) });
  };
}

/** Создать черновик своей тренировки → 201 {workout}. */
export function useCreateWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation<WorkoutResponse, ApiError, CreateWorkoutRequest>({
    mutationFn: (input) =>
      apiFetch('/client/workouts', {
        method: 'POST',
        body: createWorkoutRequestSchema.parse(input),
        schema: workoutWrap,
      }).then((r) => r.workout),
    onSuccess: (workout) => {
      invalidate(workout.id);
    },
  });
}

/** Запустить свою тренировку (draft → active). */
export function useStartWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation<WorkoutResponse, ApiError, string>({
    mutationFn: (wid) =>
      apiFetch(`/client/workouts/${wid}/start`, { method: 'POST', schema: workoutWrap }).then(
        (r) => r.workout,
      ),
    onSuccess: (workout) => {
      invalidate(workout.id);
    },
  });
}

/** Зафиксировать факт по подходу. setId — составной "<position>:<setIndex>". */
export function useUpdateWorkoutSet() {
  const invalidate = useInvalidateWorkouts();
  return useMutation<
    WorkoutResponse,
    ApiError,
    { wid: string; setId: string; input: UpdateSetRequest }
  >({
    mutationFn: ({ wid, setId, input }) =>
      apiFetch(`/client/workouts/${wid}/sets/${setId}`, {
        method: 'PATCH',
        body: updateSetRequestSchema.parse(input),
        schema: workoutWrap,
      }).then((r) => r.workout),
    onSuccess: (workout) => {
      invalidate(workout.id);
    },
  });
}

/** Завершить свою тренировку (active → completed). */
export function useCompleteWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation<WorkoutResponse, ApiError, { wid: string; input: CompleteWorkoutRequest }>({
    mutationFn: ({ wid, input }) =>
      apiFetch(`/client/workouts/${wid}/complete`, {
        method: 'POST',
        body: completeWorkoutRequestSchema.parse(input),
        schema: workoutWrap,
      }).then((r) => r.workout),
    onSuccess: (workout) => {
      invalidate(workout.id);
    },
  });
}

/** Удалить свою тренировку. */
export function useDeleteWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation<{ ok: boolean }, ApiError, string>({
    mutationFn: (wid) => apiFetch(`/client/workouts/${wid}`, { method: 'DELETE', schema: okWrap }),
    onSuccess: (_data, wid) => {
      invalidate(wid);
    },
  });
}
