import {
  createPackageRequestSchema,
  packageResponseSchema,
  packageListResponseSchema,
  type CreatePackageRequest,
  type PackageResponse,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './client';

const packageEnvelopeSchema = z.object({ package: packageResponseSchema });

export const clientPackagesQueryKey = (clientId: string) =>
  ['clients', clientId, 'packages'] as const;

/** Список пакетов клиента. */
export function listClientPackages(clientId: string): Promise<PackageResponse[]> {
  return apiFetch(`/clients/${clientId}/packages`, {
    schema: packageListResponseSchema,
  }).then((r) => r.packages);
}

/** Создание пакета занятий для клиента. */
export function createClientPackage(
  clientId: string,
  input: CreatePackageRequest,
): Promise<PackageResponse> {
  return apiFetch(`/clients/${clientId}/packages`, {
    method: 'POST',
    body: createPackageRequestSchema.parse(input),
    schema: packageEnvelopeSchema,
  }).then((r) => r.package);
}

/** Удаление пакета занятий. */
export function deleteClientPackage(clientId: string, pid: string): Promise<void> {
  return apiFetch(`/clients/${clientId}/packages/${pid}`, {
    method: 'DELETE',
    schema: z.object({ ok: z.literal(true) }),
  }).then(() => undefined);
}

/** Пакеты клиента (список). */
export function useClientPackages(clientId: string) {
  return useQuery({
    queryKey: clientPackagesQueryKey(clientId),
    queryFn: () => listClientPackages(clientId),
    enabled: clientId.length > 0,
  });
}

export function useCreatePackage(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePackageRequest) => createClientPackage(clientId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientPackagesQueryKey(clientId) });
    },
  });
}

export function useDeletePackage(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pid: string) => deleteClientPackage(clientId, pid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientPackagesQueryKey(clientId) });
    },
  });
}
