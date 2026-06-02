import { accountingSummaryResponseSchema, type AccountingSummaryResponse } from '@trener/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export const accountingSummaryQueryKey = (from: string, to: string) =>
  ['accounting', 'summary', from, to] as const;

/** Финансовая сводка тренера за период [from, to] (YYYY-MM-DD, оба обязательны). */
export function getAccountingSummary(from: string, to: string): Promise<AccountingSummaryResponse> {
  const params = new URLSearchParams({ from, to });
  return apiFetch(`/accounting/summary?${params.toString()}`, {
    schema: accountingSummaryResponseSchema,
  });
}

/** Сводка доходов/расходов/баланса за период. */
export function useAccountingSummary(from: string, to: string) {
  return useQuery({
    queryKey: accountingSummaryQueryKey(from, to),
    queryFn: () => getAccountingSummary(from, to),
  });
}
