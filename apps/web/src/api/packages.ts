import {
  createPackageRequestSchema,
  updatePackageRequestSchema,
  packageResponseSchema,
  packageListResponseSchema,
  packageBalanceListResponseSchema,
  type CreatePackageRequest,
  type UpdatePackageRequest,
  type PackageResponse,
  type PackageBalance,
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

/** Частичное обновление пакета занятий (статус, использовано занятий и т.п.). */
export function updateClientPackage(
  clientId: string,
  pid: string,
  input: UpdatePackageRequest,
): Promise<PackageResponse> {
  return apiFetch(`/clients/${clientId}/packages/${pid}`, {
    method: 'PATCH',
    body: updatePackageRequestSchema.parse(input),
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

export const packageBalancesQueryKey = ['packages', 'balances'] as const;

/** Остатки оплаченных тренировок по всем клиентам тренера. */
export function listPackageBalances(): Promise<PackageBalance[]> {
  return apiFetch('/packages/balances', { schema: packageBalanceListResponseSchema }).then(
    (r) => r.balances,
  );
}

/** Хук: остатки оплаченных тренировок по клиентам (для алертов). */
export function usePackageBalances() {
  return useQuery({ queryKey: packageBalancesQueryKey, queryFn: listPackageBalances });
}

/** Пакеты клиента (список). */
export function useClientPackages(clientId: string) {
  return useQuery({
    queryKey: clientPackagesQueryKey(clientId),
    queryFn: () => listClientPackages(clientId),
    enabled: clientId.length > 0,
  });
}

// Пакеты учитываются в бухгалтерии как доход → инвалидируем и accounting-кэш.
function invalidatePackageQueries(qc: ReturnType<typeof useQueryClient>, clientId: string): void {
  void qc.invalidateQueries({ queryKey: clientPackagesQueryKey(clientId) });
  void qc.invalidateQueries({ queryKey: ['accounting'] });
  void qc.invalidateQueries({ queryKey: packageBalancesQueryKey });
}

export function useCreatePackage(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePackageRequest) => createClientPackage(clientId, input),
    onSuccess: () => invalidatePackageQueries(qc, clientId),
  });
}

export function useUpdatePackage(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pid, input }: { pid: string; input: UpdatePackageRequest }) =>
      updateClientPackage(clientId, pid, input),
    onSuccess: () => invalidatePackageQueries(qc, clientId),
  });
}

export function useDeletePackage(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pid: string) => deleteClientPackage(clientId, pid),
    onSuccess: () => invalidatePackageQueries(qc, clientId),
  });
}
