import { z } from 'zod';

export const packageStatusSchema = z.enum(['active', 'closed', 'cancelled']);
export type PackageStatus = z.infer<typeof packageStatusSchema>;

const workoutTypeField = z.string().trim().max(100).nullish();
const noteField = z.string().trim().max(2000).nullish();

// --- Создание пакета ---

export const createPackageRequestSchema = z.object({
  lessonsPaid: z.number().int().positive(),
  pricePerLesson: z.number().positive(),
  totalPaid: z.number().positive(),
  workoutType: workoutTypeField,
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  note: noteField,
});
export type CreatePackageRequest = z.infer<typeof createPackageRequestSchema>;

// --- Обновление пакета (частичное + смена статуса) ---

export const updatePackageRequestSchema = createPackageRequestSchema.partial().extend({
  status: packageStatusSchema.optional(),
});
export type UpdatePackageRequest = z.infer<typeof updatePackageRequestSchema>;

// --- Ответы ---

export const packageResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  lessonsPaid: z.number(),
  pricePerLesson: z.number(),
  totalPaid: z.number(),
  workoutType: z.string().nullable(),
  startsAt: z.string(),
  status: packageStatusSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type PackageResponse = z.infer<typeof packageResponseSchema>;

export const packageListResponseSchema = z.object({
  packages: z.array(packageResponseSchema),
});
export type PackageListResponse = z.infer<typeof packageListResponseSchema>;
