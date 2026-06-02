import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const optInt = z.number().int().positive().nullish();
const optNum = z.number().positive().nullish();

export const workoutStatusSchema = z.enum(['draft', 'active', 'completed', 'skipped']);
export type WorkoutStatus = z.infer<typeof workoutStatusSchema>;

// --- Создание плана тренировки ---

export const plannedSetSchema = z.object({
  plannedReps: optInt,
  plannedWeightKg: optNum,
  plannedTimeSec: optInt,
  plannedRestSec: z.number().int().min(0).max(3600).nullish(),
});
export type PlannedSet = z.infer<typeof plannedSetSchema>;

export const workoutExercisePlanSchema = z.object({
  exerciseId: z.string(),
  sets: z.array(plannedSetSchema).min(1),
});
export type WorkoutExercisePlan = z.infer<typeof workoutExercisePlanSchema>;

export const createWorkoutRequestSchema = z.object({
  name,
  sourceTemplateId: z.string().nullish(),
  exercises: z.array(workoutExercisePlanSchema).min(1),
});
export type CreateWorkoutRequest = z.infer<typeof createWorkoutRequestSchema>;

// --- Редактирование набора упражнений тренировки ---

// Добавление упражнения = тот же план одной позиции (exerciseId + plannedSets).
export const addWorkoutExerciseRequestSchema = workoutExercisePlanSchema;
export type AddWorkoutExerciseRequest = z.infer<typeof addWorkoutExerciseRequestSchema>;

// order = массив текущих position в новом порядке (перестановка существующих позиций).
export const reorderWorkoutExercisesRequestSchema = z.object({
  order: z.array(z.number().int().min(0)).min(1),
});
export type ReorderWorkoutExercisesRequest = z.infer<typeof reorderWorkoutExercisesRequestSchema>;

// --- Фиксация факта по подходу ---

export const updateSetRequestSchema = z.object({
  actualReps: z.number().int().nullish(),
  actualWeightKg: optNum,
  actualTimeSec: z.number().int().nullish(),
  done: z.boolean().optional(),
});
export type UpdateSetRequest = z.infer<typeof updateSetRequestSchema>;

// --- Завершение тренировки ---

export const completeWorkoutRequestSchema = z.object({
  durationSec: optInt,
  trainerNote: z.string().trim().max(2000).nullish(),
  rpe: z.number().int().min(1).max(10).nullish(),
});
export type CompleteWorkoutRequest = z.infer<typeof completeWorkoutRequestSchema>;

// --- Ответы ---

export const workoutSetResponseSchema = z.object({
  setIndex: z.number(),
  plannedReps: z.number().nullable(),
  plannedWeightKg: z.number().nullable(),
  plannedTimeSec: z.number().nullable(),
  plannedRestSec: z.number().nullable(),
  actualReps: z.number().nullable(),
  actualWeightKg: z.number().nullable(),
  actualTimeSec: z.number().nullable(),
  done: z.boolean(),
});
export type WorkoutSetResponse = z.infer<typeof workoutSetResponseSchema>;

export const workoutExerciseResponseSchema = z.object({
  position: z.number(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  sets: z.array(workoutSetResponseSchema),
});
export type WorkoutExerciseResponse = z.infer<typeof workoutExerciseResponseSchema>;

export const workoutResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  status: workoutStatusSchema,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  durationSec: z.number().nullable(),
  trainerNote: z.string().nullable(),
  rpe: z.number().nullable(),
  exercises: z.array(workoutExerciseResponseSchema),
});
export type WorkoutResponse = z.infer<typeof workoutResponseSchema>;

export const workoutListResponseSchema = z.object({
  workouts: z.array(workoutResponseSchema),
});
export type WorkoutListResponse = z.infer<typeof workoutListResponseSchema>;
