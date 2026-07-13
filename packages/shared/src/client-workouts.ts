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
  // Допускаем пустой список: клиент создаёт пустую тренировку и наполняет её
  // упражнениями уже на странице проведения (как тренер в ActiveWorkout).
  exercises: z.array(workoutExercisePlanSchema),
  // Тренер формирует историческую запись (постфактум): не уведомлять клиента и
  // не учитывать в балансе пакета/календаре. Для клиентских тренировок игнорируется.
  excludedFromBalance: z.boolean().optional(),
});
export type CreateWorkoutRequest = z.infer<typeof createWorkoutRequestSchema>;

// Тренер фиксирует уже проведённую тренировку в истории клиента указанной датой.
export const addWorkoutToHistoryRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD'),
});
export type AddWorkoutToHistoryRequest = z.infer<typeof addWorkoutToHistoryRequestSchema>;

// --- Редактирование набора упражнений тренировки ---

// Добавление упражнения = тот же план одной позиции (exerciseId + plannedSets).
export const addWorkoutExerciseRequestSchema = workoutExercisePlanSchema;
export type AddWorkoutExerciseRequest = z.infer<typeof addWorkoutExerciseRequestSchema>;

// Добавление ОДНОГО подхода к упражнению (плановые параметры, все опциональны).
export const addWorkoutSetRequestSchema = plannedSetSchema;
export type AddWorkoutSetRequest = z.infer<typeof addWorkoutSetRequestSchema>;

// order = массив текущих position в новом порядке (перестановка существующих позиций).
export const reorderWorkoutExercisesRequestSchema = z.object({
  order: z.array(z.number().int().min(0)).min(1),
});
export type ReorderWorkoutExercisesRequest = z.infer<typeof reorderWorkoutExercisesRequestSchema>;

// --- Фиксация факта по подходу ---

export const updateSetRequestSchema = z.object({
  plannedReps: z.number().int().positive().nullish(),
  plannedWeightKg: z.number().positive().nullish(),
  plannedTimeSec: z.number().int().positive().nullish(),
  plannedRestSec: z.number().int().min(0).max(3600).nullish(),
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
  // Смещение таймзоны устройства тренера от UTC в минутах (как Dart
  // timeZoneOffset.inMinutes, +180 для МСК). По нему сервер проставляет ЛОКАЛЬНОЕ
  // время авто-созданного занятия (иначе оно бы шло по времени сервера/UTC).
  tzOffsetMinutes: z.number().int().nullish(),
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
  createdByClient: z.boolean(),
  // Историческая запись тренера: не уменьшает баланс пакета, нет в календаре.
  excludedFromBalance: z.boolean(),
  exercises: z.array(workoutExerciseResponseSchema),
});
export type WorkoutResponse = z.infer<typeof workoutResponseSchema>;

export const workoutListResponseSchema = z.object({
  workouts: z.array(workoutResponseSchema),
});
export type WorkoutListResponse = z.infer<typeof workoutListResponseSchema>;
