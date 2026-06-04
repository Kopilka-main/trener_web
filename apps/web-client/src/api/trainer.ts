import { trainerPublicResponseSchema, type TrainerPublicResponse } from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';
import { clientMeQueryKey } from './auth';

const trainerWrap = z.object({ trainer: trainerPublicResponseSchema });

export const clientTrainerQueryKey = ['client', 'trainer'] as const;

/** Публичный профиль привязанного тренера. 409 (не привязан) → null. */
export function useClientTrainer() {
  return useQuery<TrainerPublicResponse | null>({
    queryKey: clientTrainerQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/trainer', { schema: trainerWrap });
        return r.trainer;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return null;
        throw err;
      }
    },
  });
}

/** Отключение от тренера (мягкая отвязка аккаунта). После — клиент «не подключён». */
export function useDisconnectTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch('/client/trainer/disconnect', {
        method: 'POST',
        schema: z.object({ ok: z.literal(true) }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeQueryKey });
      void qc.invalidateQueries({ queryKey: clientTrainerQueryKey });
    },
  });
}
