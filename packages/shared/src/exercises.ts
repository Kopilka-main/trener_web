import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const category = z.string().trim().min(1).max(100);
const optInt = z.number().int().positive().nullish();
const optNum = z.number().positive().nullish();

export const createExerciseRequestSchema = z.object({
  name,
  category,
  subgroup: z.string().trim().max(100).nullish(),
  description: z.string().trim().max(4000).nullish(),
  defaultReps: optInt,
  defaultWeightKg: optNum,
  defaultTimeSec: optInt,
  restSec: z.number().int().min(0).max(3600).default(90),
  note: z.string().trim().max(2000).nullish(),
});
export type CreateExerciseRequest = z.infer<typeof createExerciseRequestSchema>;

export const updateExerciseRequestSchema = createExerciseRequestSchema.partial();
export type UpdateExerciseRequest = z.infer<typeof updateExerciseRequestSchema>;

export const exerciseResponseSchema = z.object({
  id: z.string(),
  isGlobal: z.boolean(), // trainerId === null
  name: z.string(),
  category: z.string(),
  subgroup: z.string().nullable(),
  description: z.string().nullable(),
  defaultReps: z.number().nullable(),
  defaultWeightKg: z.number().nullable(),
  defaultTimeSec: z.number().nullable(),
  restSec: z.number(),
  note: z.string().nullable(),
});
export type ExerciseResponse = z.infer<typeof exerciseResponseSchema>;

export const exerciseListResponseSchema = z.object({
  exercises: z.array(exerciseResponseSchema),
});
export type ExerciseListResponse = z.infer<typeof exerciseListResponseSchema>;
