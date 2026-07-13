import { z } from 'zod';

// Семантика nullish-полей замера (единообразно, как в exercises):
//   явный null = очистить значение поля; отсутствие = не трогать при PATCH.
const metricField = z.number().positive().nullish();
const noteField = z.string().trim().max(2000).nullish();

// --- Создание замера ---

export const createMeasurementRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  weightKg: metricField,
  skeletalMuscleKg: metricField,
  bodyFatPct: metricField,
  bicepsCm: metricField,
  chestCm: metricField,
  underbustCm: metricField,
  waistCm: metricField,
  bellyCm: metricField,
  glutesCm: metricField,
  hipsCm: metricField,
  thighCm: metricField,
  calfCm: metricField,
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
  skeletalMuscleKg: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  bicepsCm: z.number().nullable(),
  chestCm: z.number().nullable(),
  underbustCm: z.number().nullable(),
  waistCm: z.number().nullable(),
  bellyCm: z.number().nullable(),
  glutesCm: z.number().nullable(),
  hipsCm: z.number().nullable(),
  thighCm: z.number().nullable(),
  calfCm: z.number().nullable(),
  note: z.string().nullable(),
  createdByClient: z.boolean(),
  createdAt: z.string(),
});
export type MeasurementResponse = z.infer<typeof measurementResponseSchema>;

export const measurementListResponseSchema = z.object({
  measurements: z.array(measurementResponseSchema),
});
export type MeasurementListResponse = z.infer<typeof measurementListResponseSchema>;

// --- Задача на замеры (тренер просит клиента сделать замеры) ---
// Висит у клиента в уведомлениях, пока он не внесёт замер (тогда авторазрешается).

export const createMeasurementTaskSchema = z.object({
  note: noteField,
});
export type CreateMeasurementTask = z.infer<typeof createMeasurementTaskSchema>;

export const measurementTaskResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type MeasurementTaskResponse = z.infer<typeof measurementTaskResponseSchema>;

export const measurementTaskListResponseSchema = z.object({
  tasks: z.array(measurementTaskResponseSchema),
});
export type MeasurementTaskListResponse = z.infer<typeof measurementTaskListResponseSchema>;
