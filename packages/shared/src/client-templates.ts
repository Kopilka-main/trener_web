import { z } from 'zod';
import { workoutExercisePlanSchema } from './client-workouts.js';

// Шаблон тренировки клиента: имя + план упражнений (как при создании тренировки).
export const clientTemplateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  exercises: z.array(workoutExercisePlanSchema),
  createdAt: z.string(),
});
export type ClientTemplateResponse = z.infer<typeof clientTemplateResponseSchema>;

export const clientTemplateListResponseSchema = z.object({
  templates: z.array(clientTemplateResponseSchema),
});
export type ClientTemplateListResponse = z.infer<typeof clientTemplateListResponseSchema>;

// Сохранение тренировки как шаблона: имя + план (минимум одно упражнение).
export const saveClientTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  exercises: z.array(workoutExercisePlanSchema).min(1),
});
export type SaveClientTemplateRequest = z.infer<typeof saveClientTemplateRequestSchema>;
