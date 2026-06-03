import {
  createGymRequestSchema,
  gymListResponseSchema,
  gymResponseSchema,
  type CreateGymRequest,
  type GymResponse,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './client';

const gymEnvelopeSchema = z.object({ gym: gymResponseSchema });

export const gymsQueryKey = ['gyms'] as const;

/** Список залов тренера. */
export function listGyms(): Promise<GymResponse[]> {
  return apiFetch('/gyms', { schema: gymListResponseSchema }).then((r) => r.gyms);
}

/** Создание зала. */
export function createGym(input: CreateGymRequest): Promise<GymResponse> {
  return apiFetch('/gyms', {
    method: 'POST',
    body: createGymRequestSchema.parse(input),
    schema: gymEnvelopeSchema,
  }).then((r) => r.gym);
}

/** Удаление зала. */
export function deleteGym(id: string): Promise<void> {
  return apiFetch(`/gyms/${id}`, {
    method: 'DELETE',
    schema: z.object({ ok: z.literal(true) }),
  }).then(() => undefined);
}

export function useGyms() {
  return useQuery({ queryKey: gymsQueryKey, queryFn: listGyms });
}

export function useCreateGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGymRequest) => createGym(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gymsQueryKey });
    },
  });
}

export function useDeleteGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGym(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gymsQueryKey });
    },
  });
}
