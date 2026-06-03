import {
  sessionListResponseSchema,
  sessionResponseSchema,
  type SessionResponse,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const sessionWrap = z.object({ session: sessionResponseSchema });

/** Интервал опроса календаря (мс). Вебсокетов нет — polling, как в чате. */
const SESSIONS_REFETCH_MS = 8000;

export const clientSessionsQueryKey = (from?: string, to?: string) =>
  ['client', 'sessions', from ?? '', to ?? ''] as const;

/** Занятия клиента за диапазон. Непривязанный клиент (409) → пустой список, не ошибка. */
export function useClientSessions(from?: string, to?: string) {
  return useQuery<SessionResponse[]>({
    queryKey: clientSessionsQueryKey(from, to),
    queryFn: async () => {
      try {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        const r = await apiFetch(`/client/sessions?${qs.toString()}`, {
          schema: sessionListResponseSchema,
        });
        return r.sessions;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
    refetchInterval: SESSIONS_REFETCH_MS,
  });
}

/** Подтверждение/отклонение занятия клиентом. Инвалидирует все диапазоны списка. */
export function useConfirmSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: 'confirmed' | 'declined' }) =>
      apiFetch(`/client/sessions/${input.id}/confirmation`, {
        method: 'POST',
        body: { status: input.status },
        schema: sessionWrap,
      }).then((r) => r.session),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', 'sessions'] });
    },
  });
}
