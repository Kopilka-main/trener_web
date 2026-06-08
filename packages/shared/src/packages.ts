import { z } from 'zod';

export const packageStatusSchema = z.enum(['active', 'closed', 'cancelled']);
export type PackageStatus = z.infer<typeof packageStatusSchema>;

// Вид: пакет тренировок (по количеству) либо абонемент (доступ на период).
export const packageKindSchema = z.enum(['package', 'subscription']);
export type PackageKind = z.infer<typeof packageKindSchema>;

const workoutTypeField = z.string().trim().max(100).nullish();
const noteField = z.string().trim().max(2000).nullish();
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD

// --- Создание пакета ---
// lessonsPaid/pricePerLesson допускают 0 — для абонемента (только период).

export const createPackageRequestSchema = z.object({
  kind: packageKindSchema.default('package'),
  lessonsPaid: z.number().int().min(0),
  pricePerLesson: z.number().min(0),
  totalPaid: z.number().positive(),
  workoutType: workoutTypeField,
  paidAt: dateField.nullish(), // дата оплаты
  startsAt: dateField, // дата начала
  endsAt: dateField.nullish(), // дата окончания (период)
  note: noteField,
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
});
export type CreatePackageRequest = z.infer<typeof createPackageRequestSchema>;

// --- Обновление пакета (частичное + смена статуса) ---

export const updatePackageRequestSchema = createPackageRequestSchema.partial().extend({
  status: packageStatusSchema.optional(),
  lessonsUsed: z.number().int().min(0).optional(),
});
export type UpdatePackageRequest = z.infer<typeof updatePackageRequestSchema>;

// --- Ответы ---

export const packageResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  kind: packageKindSchema,
  lessonsPaid: z.number(),
  lessonsUsed: z.number(),
  pricePerLesson: z.number(),
  totalPaid: z.number(),
  workoutType: z.string().nullable(),
  paidAt: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  status: packageStatusSchema,
  note: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
});
export type PackageResponse = z.infer<typeof packageResponseSchema>;

export const packageListResponseSchema = z.object({
  packages: z.array(packageResponseSchema),
});
export type PackageListResponse = z.infer<typeof packageListResponseSchema>;

// Остаток оплаченных тренировок по клиенту (для алертов/сводки тренера).
export const packageBalanceSchema = z.object({
  clientId: z.string(),
  remaining: z.number(),
});
export type PackageBalance = z.infer<typeof packageBalanceSchema>;

export const packageBalanceListResponseSchema = z.object({
  balances: z.array(packageBalanceSchema),
});
export type PackageBalanceListResponse = z.infer<typeof packageBalanceListResponseSchema>;
