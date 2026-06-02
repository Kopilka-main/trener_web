import { sessionListResponseSchema, type SessionResponse } from '@trener/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export const sessionsQueryKey = (from?: string, to?: string) =>
  ['sessions', from ?? null, to ?? null] as const;

/** Список занятий тренера в диапазоне [from, to] (YYYY-MM-DD, оба опциональны). */
export function listSessions(from?: string, to?: string): Promise<SessionResponse[]> {
  const params = new URLSearchParams();
  if (from !== undefined) params.set('from', from);
  if (to !== undefined) params.set('to', to);
  const qs = params.toString();
  return apiFetch(`/sessions${qs ? `?${qs}` : ''}`, {
    schema: sessionListResponseSchema,
  }).then((r) => r.sessions);
}

/** Занятия тренера за период. */
export function useSessions(from?: string, to?: string) {
  return useQuery({
    queryKey: sessionsQueryKey(from, to),
    queryFn: () => listSessions(from, to),
  });
}
