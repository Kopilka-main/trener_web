import { z } from 'zod';
import {
  createWorkoutRequestSchema,
  updateSetRequestSchema,
  completeWorkoutRequestSchema,
  workoutResponseSchema,
  workoutListResponseSchema,
  type WorkoutResponse,
  type CreateWorkoutRequest,
  type UpdateSetRequest,
  type CompleteWorkoutRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

const workoutEnvelopeSchema = z.object({ workout: workoutResponseSchema });
const okEnvelopeSchema = z.object({ ok: z.boolean() });

export const clientWorkoutsQueryKey = (clientId: string) =>
  ['clients', clientId, 'workouts'] as const;
export const clientWorkoutQueryKey = (clientId: string, wid: string) =>
  ['clients', clientId, 'workouts', wid] as const;

export function listClientWorkouts(clientId: string): Promise<WorkoutResponse[]> {
  return apiFetch(`/clients/${clientId}/workouts`, {
    schema: workoutListResponseSchema,
  }).then((r) => r.workouts);
}

export function getClientWorkout(clientId: string, wid: string): Promise<WorkoutResponse> {
  return apiFetch(`/clients/${clientId}/workouts/${wid}`, {
    schema: workoutEnvelopeSchema,
  }).then((r) => r.workout);
}

export function createClientWorkout(
  clientId: string,
  input: CreateWorkoutRequest,
): Promise<WorkoutResponse> {
  return apiFetch(`/clients/${clientId}/workouts`, {
    method: 'POST',
    body: createWorkoutRequestSchema.parse(input),
    schema: workoutEnvelopeSchema,
  }).then((r) => r.workout);
}

export function startClientWorkout(clientId: string, wid: string): Promise<WorkoutResponse> {
  return apiFetch(`/clients/${clientId}/workouts/${wid}/start`, {
    method: 'POST',
    schema: workoutEnvelopeSchema,
  }).then((r) => r.workout);
}

export interface UpdateSetArgs {
  pos: number;
  idx: number;
  body: UpdateSetRequest;
}

export function updateWorkoutSet(
  clientId: string,
  wid: string,
  { pos, idx, body }: UpdateSetArgs,
): Promise<WorkoutResponse> {
  return apiFetch(`/clients/${clientId}/workouts/${wid}/exercises/${pos}/sets/${idx}`, {
    method: 'PATCH',
    body: updateSetRequestSchema.parse(body),
    schema: workoutEnvelopeSchema,
  }).then((r) => r.workout);
}

export function completeClientWorkout(
  clientId: string,
  wid: string,
  input: CompleteWorkoutRequest,
): Promise<WorkoutResponse> {
  return apiFetch(`/clients/${clientId}/workouts/${wid}/complete`, {
    method: 'POST',
    body: completeWorkoutRequestSchema.parse(input),
    schema: workoutEnvelopeSchema,
  }).then((r) => r.workout);
}

export function deleteClientWorkout(clientId: string, wid: string): Promise<{ ok: boolean }> {
  return apiFetch(`/clients/${clientId}/workouts/${wid}`, {
    method: 'DELETE',
    schema: okEnvelopeSchema,
  });
}

/** Список тренировок клиента. */
export function useClientWorkouts(clientId: string) {
  return useQuery({
    queryKey: clientWorkoutsQueryKey(clientId),
    queryFn: () => listClientWorkouts(clientId),
    enabled: clientId.length > 0,
  });
}

/** Одна тренировка клиента. */
export function useWorkout(clientId: string, wid: string) {
  return useQuery({
    queryKey: clientWorkoutQueryKey(clientId, wid),
    queryFn: () => getClientWorkout(clientId, wid),
    enabled: clientId.length > 0 && wid.length > 0,
  });
}

export function useCreateWorkout(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkoutRequest) => createClientWorkout(clientId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientWorkoutsQueryKey(clientId) });
    },
  });
}

export function useStartWorkout(clientId: string, wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => startClientWorkout(clientId, wid),
    onSuccess: (workout) => {
      qc.setQueryData(clientWorkoutQueryKey(clientId, wid), workout);
      void qc.invalidateQueries({ queryKey: clientWorkoutsQueryKey(clientId) });
    },
  });
}

export function useUpdateSet(clientId: string, wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: UpdateSetArgs) => updateWorkoutSet(clientId, wid, args),
    onSuccess: (workout) => {
      qc.setQueryData(clientWorkoutQueryKey(clientId, wid), workout);
    },
  });
}

export function useCompleteWorkout(clientId: string, wid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompleteWorkoutRequest) => completeClientWorkout(clientId, wid, input),
    onSuccess: (workout) => {
      qc.setQueryData(clientWorkoutQueryKey(clientId, wid), workout);
      void qc.invalidateQueries({ queryKey: clientWorkoutsQueryKey(clientId) });
    },
  });
}

export function useDeleteWorkout(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wid: string) => deleteClientWorkout(clientId, wid),
    onSuccess: (_data, wid) => {
      void qc.invalidateQueries({ queryKey: clientWorkoutsQueryKey(clientId) });
      void qc.invalidateQueries({ queryKey: clientWorkoutQueryKey(clientId, wid) });
    },
  });
}
