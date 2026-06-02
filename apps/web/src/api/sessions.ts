import { z } from 'zod';
import {
  createSessionRequestSchema,
  sessionListResponseSchema,
  sessionResponseSchema,
  updateSessionRequestSchema,
  type CreateSessionRequest,
  type SessionResponse,
  type UpdateSessionRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

const sessionEnvelopeSchema = z.object({ session: sessionResponseSchema });
const okEnvelopeSchema = z.object({ ok: z.boolean() });

export const sessionsQueryKey = (from?: string, to?: string) =>
  ['sessions', from ?? null, to ?? null] as const;
export const clientSessionsQueryKey = (clientId: string) =>
  ['clients', clientId, 'sessions'] as const;

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

export function createSession(input: CreateSessionRequest): Promise<SessionResponse> {
  return apiFetch('/sessions', {
    method: 'POST',
    body: createSessionRequestSchema.parse(input),
    schema: sessionEnvelopeSchema,
  }).then((r) => r.session);
}

export function updateSession(id: string, patch: UpdateSessionRequest): Promise<SessionResponse> {
  return apiFetch(`/sessions/${id}`, {
    method: 'PATCH',
    body: updateSessionRequestSchema.parse(patch),
    schema: sessionEnvelopeSchema,
  }).then((r) => r.session);
}

export function deleteSession(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/sessions/${id}`, {
    method: 'DELETE',
    schema: okEnvelopeSchema,
  });
}

/** Занятия тренера за период. */
export function useSessions(from?: string, to?: string) {
  return useQuery({
    queryKey: sessionsQueryKey(from, to),
    queryFn: () => listSessions(from, to),
  });
}

/**
 * Занятия конкретного клиента. API даёт список тренера (фильтр только по датам),
 * поэтому фильтруем по clientId на клиенте.
 */
export function useClientSessions(clientId: string) {
  return useQuery({
    queryKey: clientSessionsQueryKey(clientId),
    queryFn: () => listSessions(),
    enabled: clientId.length > 0,
    select: (sessions) => sessions.filter((s) => s.clientId === clientId),
  });
}

/** Инвалидация всех списков занятий (трейнер-широких и по клиенту). */
function invalidateSessions(qc: ReturnType<typeof useQueryClient>, clientId: string): void {
  void qc.invalidateQueries({ queryKey: ['sessions'] });
  void qc.invalidateQueries({ queryKey: clientSessionsQueryKey(clientId) });
}

export function useCreateSession(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionRequest) => createSession(input),
    onSuccess: () => invalidateSessions(qc, clientId),
  });
}

export function useUpdateSession(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSessionRequest }) =>
      updateSession(id, patch),
    onSuccess: () => invalidateSessions(qc, clientId),
  });
}

export function useDeleteSession(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => invalidateSessions(qc, clientId),
  });
}
