import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
const noteField = z.string().trim().max(2000).nullish();
// Хэштеги операции: без ведущего «#», без пустых, до 30 штук.
const tagsField = z.array(z.string().trim().min(1).max(40)).max(30).optional();
const tagsResponse = z.array(z.string());

// --- Залы (gyms) ---

export const createGymRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  monthlyRent: z.number().positive().nullish(),
  note: noteField,
});
export type CreateGymRequest = z.infer<typeof createGymRequestSchema>;

export const updateGymRequestSchema = createGymRequestSchema.partial();
export type UpdateGymRequest = z.infer<typeof updateGymRequestSchema>;

export const gymResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  monthlyRent: z.number().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type GymResponse = z.infer<typeof gymResponseSchema>;

export const gymListResponseSchema = z.object({
  gyms: z.array(gymResponseSchema),
});
export type GymListResponse = z.infer<typeof gymListResponseSchema>;

// --- Расходы (expenses) ---

export const createExpenseRequestSchema = z.object({
  category: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  date: dateStr,
  gymId: z.string().nullish(),
  clientId: z.string().nullish(),
  note: noteField,
  tags: tagsField,
});
export type CreateExpenseRequest = z.infer<typeof createExpenseRequestSchema>;

export const updateExpenseRequestSchema = createExpenseRequestSchema.partial();
export type UpdateExpenseRequest = z.infer<typeof updateExpenseRequestSchema>;

export const expenseResponseSchema = z.object({
  id: z.string(),
  category: z.string(),
  amount: z.number(),
  date: z.string(),
  gymId: z.string().nullable(),
  clientId: z.string().nullable(),
  note: z.string().nullable(),
  tags: tagsResponse,
  createdAt: z.string(),
});
export type ExpenseResponse = z.infer<typeof expenseResponseSchema>;

export const expenseListResponseSchema = z.object({
  expenses: z.array(expenseResponseSchema),
});
export type ExpenseListResponse = z.infer<typeof expenseListResponseSchema>;

// --- Доходы (incomes) ---

export const createIncomeRequestSchema = z.object({
  category: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  date: dateStr,
  clientId: z.string().nullish(),
  note: noteField,
  tags: tagsField,
});
export type CreateIncomeRequest = z.infer<typeof createIncomeRequestSchema>;

export const updateIncomeRequestSchema = createIncomeRequestSchema.partial();
export type UpdateIncomeRequest = z.infer<typeof updateIncomeRequestSchema>;

export const incomeResponseSchema = z.object({
  id: z.string(),
  category: z.string(),
  amount: z.number(),
  date: z.string(),
  clientId: z.string().nullable(),
  note: z.string().nullable(),
  tags: tagsResponse,
  // Доп. детализация (заполняется для синтетических строк-пакетов; иначе null):
  // title — название (тип тренировки), subtitle — пояснение (напр. «20 трен.»).
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  createdAt: z.string(),
});
export type IncomeResponse = z.infer<typeof incomeResponseSchema>;

export const incomeListResponseSchema = z.object({
  incomes: z.array(incomeResponseSchema),
});
export type IncomeListResponse = z.infer<typeof incomeListResponseSchema>;

// --- Сводка (summary) ---

export const accountingSummaryResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  totalIncome: z.number(),
  totalExpense: z.number(),
  balance: z.number(),
});
export type AccountingSummaryResponse = z.infer<typeof accountingSummaryResponseSchema>;
