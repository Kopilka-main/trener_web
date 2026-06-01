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
import { apiFetch } from './client';

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
