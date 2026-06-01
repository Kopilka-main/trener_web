import { z } from 'zod';

// Семантика nullish-полей замера (единообразно, как в exercises):
//   явный null = очистить значение поля; отсутствие = не трогать при PATCH.
const metricField = z.number().positive().nullish();
const noteField = z.string().trim().max(2000).nullish();

// --- Создание замера ---

export const createMeasurementRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  weightKg: metricField,
  bodyFatPct: metricField,
  chestCm: metricField,
  waistCm: metricField,
  hipsCm: metricField,
  note: noteField,
});
export type CreateMeasurementRequest = z.infer<typeof createMeasurementRequestSchema>;

// --- Обновление замера (частичное) ---

export const updateMeasurementRequestSchema = createMeasurementRequestSchema.partial();
export type UpdateMeasurementRequest = z.infer<typeof updateMeasurementRequestSchema>;

// --- Ответы ---

export const measurementResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  date: z.string(),
  weightKg: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  chestCm: z.number().nullable(),
  waistCm: z.number().nullable(),
  hipsCm: z.number().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type MeasurementResponse = z.infer<typeof measurementResponseSchema>;

export const measurementListResponseSchema = z.object({
  measurements: z.array(measurementResponseSchema),
});
export type MeasurementListResponse = z.infer<typeof measurementListResponseSchema>;
