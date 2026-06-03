import {
  clientAccountResponseSchema,
  clientMeResponseSchema,
  type ClientLoginRequest,
  type ClientMeResponse,
  type ClientRegisterRequest,
  type UpdateClientAccountRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const accountEnvelope = z.object({ account: clientAccountResponseSchema });

export const clientMeQueryKey = ['client', 'me'] as const;

/** Текущий клиент + привязка. 401 → null (не залогинен), а не ошибка. */
export function useClientMe() {
  return useQuery<ClientMeResponse | null>({
    queryKey: clientMeQueryKey,
    queryFn: async () => {
      try {
        return await apiFetch('/client/auth/me', { schema: clientMeResponseSchema });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    // Залогинен, но тренер ещё не подключил (link === null) → поллим, чтобы
    // экран «Подключение» сам сменился на приложение сразу после привязки.
    refetchInterval: (query) => (query.state.data?.link === null ? 4000 : false),
  });
}

export function useClientRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientRegisterRequest) =>
      apiFetch('/client/auth/register', { method: 'POST', body: input, schema: accountEnvelope }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeQueryKey });
    },
  });
}

export function useClientLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientLoginRequest) =>
      apiFetch('/client/auth/login', { method: 'POST', body: input, schema: accountEnvelope }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeQueryKey });
    },
  });
}

export function useClientLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch('/client/auth/logout', {
        method: 'POST',
        schema: z.object({ ok: z.literal(true) }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeQueryKey });
    },
  });
}

export function useUpdateClientProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClientAccountRequest) =>
      apiFetch('/client/auth/me', { method: 'PATCH', body: input, schema: accountEnvelope }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeQueryKey });
    },
  });
}
