import { z } from 'zod';
import {
  createClientRequestSchema,
  updateClientRequestSchema,
  clientResponseSchema,
  clientListResponseSchema,
  type ClientResponse,
  type CreateClientRequest,
  type UpdateClientRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from './client';

const clientEnvelopeSchema = z.object({ client: clientResponseSchema });
const okEnvelopeSchema = z.object({ ok: z.boolean() });

export const clientsQueryKey = ['clients'] as const;
export const clientQueryKey = (id: string) => ['clients', id] as const;

export function listClients(): Promise<ClientResponse[]> {
  return apiFetch('/clients', { schema: clientListResponseSchema }).then((r) => r.clients);
}

export function getClient(id: string): Promise<ClientResponse> {
  return apiFetch(`/clients/${id}`, { schema: clientEnvelopeSchema }).then((r) => r.client);
}

/** Проверяет, существует ли клиентский аккаунт с таким кодом привязки (для диалога «Подключить»). */
export function verifyConnectCode(code: string): Promise<boolean> {
  const params = new URLSearchParams({ code });
  return apiFetch(`/clients/connect-code/check?${params.toString()}`, {
    schema: z.object({ exists: z.boolean() }),
  }).then((r) => r.exists);
}

export function createClient(input: CreateClientRequest): Promise<ClientResponse> {
  return apiFetch('/clients', {
    method: 'POST',
    body: createClientRequestSchema.parse(input),
    schema: clientEnvelopeSchema,
  }).then((r) => r.client);
}

export function updateClient(id: string, input: UpdateClientRequest): Promise<ClientResponse> {
  return apiFetch(`/clients/${id}`, {
    method: 'PATCH',
    body: updateClientRequestSchema.parse(input),
    schema: clientEnvelopeSchema,
  }).then((r) => r.client);
}

export function deleteClient(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/clients/${id}`, { method: 'DELETE', schema: okEnvelopeSchema });
}

interface ApiErrorBody {
  error?: unknown;
  code?: unknown;
}

/**
 * Загрузка аватара — multipart/form-data. apiFetch только для JSON, поэтому здесь
 * отдельный fetch с credentials:'include' и БЕЗ ручного Content-Type (браузер сам
 * проставит boundary). Поле `photo` — как в progress-photos.
 */
export async function uploadClientAvatar(id: string, file: File): Promise<ClientResponse> {
  const form = new FormData();
  form.append('photo', file);

  const res = await fetch(`/api/clients/${id}/avatar`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = res.statusText || `Ошибка запроса (${String(res.status)})`;
    try {
      const errBody = (await res.json()) as ApiErrorBody;
      if (typeof errBody.code === 'string') code = errBody.code;
      if (typeof errBody.error === 'string') message = errBody.error;
    } catch {
      // тело не JSON — оставляем дефолты
    }
    throw new ApiError(res.status, code, message);
  }

  const data: unknown = await res.json();
  return clientEnvelopeSchema.parse(data).client;
}

export function removeClientAvatar(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/clients/${id}/avatar`, { method: 'DELETE', schema: okEnvelopeSchema });
}

/** Список клиентов тренера. */
export function useClients() {
  return useQuery({
    queryKey: clientsQueryKey,
    queryFn: listClients,
  });
}

/** Один клиент по id. */
export function useClient(id: string) {
  return useQuery({
    queryKey: clientQueryKey(id),
    queryFn: () => getClient(id),
    enabled: id.length > 0,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientsQueryKey });
    },
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClientRequest) => updateClient(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientsQueryKey });
      void qc.invalidateQueries({ queryKey: clientQueryKey(id) });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteClient,
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: clientsQueryKey });
      void qc.invalidateQueries({ queryKey: clientQueryKey(id) });
    },
  });
}

export function useUploadClientAvatar(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadClientAvatar(id, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientsQueryKey });
      void qc.invalidateQueries({ queryKey: clientQueryKey(id) });
    },
  });
}

export function useRemoveClientAvatar(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => removeClientAvatar(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientsQueryKey });
      void qc.invalidateQueries({ queryKey: clientQueryKey(id) });
    },
  });
}
