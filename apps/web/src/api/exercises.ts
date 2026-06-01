import { z } from 'zod';
import {
  createExerciseRequestSchema,
  updateExerciseRequestSchema,
  exerciseResponseSchema,
  exerciseListResponseSchema,
  type ExerciseResponse,
  type CreateExerciseRequest,
  type UpdateExerciseRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

const exerciseEnvelopeSchema = z.object({ exercise: exerciseResponseSchema });
const okEnvelopeSchema = z.object({ ok: z.boolean() });

export const exercisesQueryKey = ['exercises'] as const;
export const exerciseQueryKey = (id: string) => ['exercises', id] as const;

export function listExercises(): Promise<ExerciseResponse[]> {
  return apiFetch('/exercises', { schema: exerciseListResponseSchema }).then((r) => r.exercises);
}

export function getExercise(id: string): Promise<ExerciseResponse> {
  return apiFetch(`/exercises/${id}`, { schema: exerciseEnvelopeSchema }).then((r) => r.exercise);
}

export function createExercise(input: CreateExerciseRequest): Promise<ExerciseResponse> {
  return apiFetch('/exercises', {
    method: 'POST',
    body: createExerciseRequestSchema.parse(input),
    schema: exerciseEnvelopeSchema,
  }).then((r) => r.exercise);
}

export function updateExercise(
  id: string,
  input: UpdateExerciseRequest,
): Promise<ExerciseResponse> {
  return apiFetch(`/exercises/${id}`, {
    method: 'PATCH',
    body: updateExerciseRequestSchema.parse(input),
    schema: exerciseEnvelopeSchema,
  }).then((r) => r.exercise);
}

export function deleteExercise(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/exercises/${id}`, { method: 'DELETE', schema: okEnvelopeSchema });
}

/** Каталог упражнений тренера (личные + глобальные). */
export function useExercises() {
  return useQuery({
    queryKey: exercisesQueryKey,
    queryFn: listExercises,
  });
}

/** Одно упражнение по id. */
export function useExercise(id: string) {
  return useQuery({
    queryKey: exerciseQueryKey(id),
    queryFn: () => getExercise(id),
    enabled: id.length > 0,
  });
}

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createExercise,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exercisesQueryKey });
    },
  });
}

export function useUpdateExercise(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateExerciseRequest) => updateExercise(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exercisesQueryKey });
      void qc.invalidateQueries({ queryKey: exerciseQueryKey(id) });
    },
  });
}

export function useDeleteExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteExercise,
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: exercisesQueryKey });
      void qc.invalidateQueries({ queryKey: exerciseQueryKey(id) });
    },
  });
}
