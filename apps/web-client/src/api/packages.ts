import { packageListResponseSchema, type PackageResponse } from '@trener/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from './client';

export const clientPackagesQueryKey = ['client', 'packages'] as const;

/** Пакеты клиента (для уведомления о заканчивающемся). Непривязанный (409) → []. */
export function useClientPackages() {
  return useQuery<PackageResponse[]>({
    queryKey: clientPackagesQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/packages', { schema: packageListResponseSchema });
        return r.packages;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
  });
}
