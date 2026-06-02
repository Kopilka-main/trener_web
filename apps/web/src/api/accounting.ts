import {
  accountingSummaryResponseSchema,
  createExpenseRequestSchema,
  expenseResponseSchema,
  expenseListResponseSchema,
  type AccountingSummaryResponse,
  type CreateExpenseRequest,
  type ExpenseResponse,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
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

// --- Расходы (expenses) ---
//
// Бэкенд не фильтрует расходы по клиенту (querystring только from/to), а сами
// расходы несут поле clientId. Поэтому грузим список расходов целиком и
// фильтруем по клиенту на клиенте. Ключ — общий для всех расходов тренера.

const expenseEnvelopeSchema = z.object({ expense: expenseResponseSchema });

export const expensesQueryKey = ['accounting', 'expenses'] as const;

/** Все расходы тренера (без фильтра по диапазону). */
export function listExpenses(): Promise<ExpenseResponse[]> {
  return apiFetch(`/expenses`, { schema: expenseListResponseSchema }).then((r) => r.expenses);
}

/** Создание расхода (может быть привязан к клиенту через clientId). */
export function createExpense(input: CreateExpenseRequest): Promise<ExpenseResponse> {
  return apiFetch(`/expenses`, {
    method: 'POST',
    body: createExpenseRequestSchema.parse(input),
    schema: expenseEnvelopeSchema,
  }).then((r) => r.expense);
}

/** Удаление расхода. */
export function deleteExpense(id: string): Promise<void> {
  return apiFetch(`/expenses/${id}`, {
    method: 'DELETE',
    schema: z.object({ ok: z.literal(true) }),
  }).then(() => undefined);
}

/** Расходы тренера (полный список; фильтрацию по клиенту делает вызывающий). */
export function useExpenses() {
  return useQuery({
    queryKey: expensesQueryKey,
    queryFn: listExpenses,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseRequest) => createExpense(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesQueryKey });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: expensesQueryKey });
    },
  });
}
