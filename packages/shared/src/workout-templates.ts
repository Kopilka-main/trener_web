import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const categoryTag = z.string().trim().max(100).nullish();
const optInt = z.number().int().positive().nullish();
const optNum = z.number().positive().nullish();

export const templateExerciseSchema = z.object({
  exerciseId: z.string(),
  sets: z.number().int().positive(),
  reps: optInt,
  weightKg: optNum,
  timeSec: optInt,
  restSec: z.number().int().min(0).max(3600).default(90),
});
export type TemplateExercise = z.infer<typeof templateExerciseSchema>;

export const createTemplateRequestSchema = z.object({
  name,
  categoryTag,
  shortDescription: z.string().trim().max(2000).nullish(),
  // Задан → персональный шаблон этого клиента; отсутствует → общий шаблон «Базы знаний».
  // Связь клиента с тренером проверяется в сервисе (иначе 400 CLIENT_NOT_LINKED).
  clientId: z.string().optional(),
  exercises: z.array(templateExerciseSchema).min(1),
});
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>;

// partial: при наличии exercises список заменяется целиком. clientId (scope шаблона)
// неизменен: сервис его при обновлении игнорирует — перенос между клиентами запрещён.
export const updateTemplateRequestSchema = createTemplateRequestSchema.partial();
export type UpdateTemplateRequest = z.infer<typeof updateTemplateRequestSchema>;

export const templateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryTag: z.string().nullable(),
  shortDescription: z.string().nullable(),
  // clientId: null = общий шаблон; задан = персональный. clientName — «для: Имя»
  // (собранное имя клиента), null у общих.
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  exercises: z.array(
    z.object({
      position: z.number(),
      exerciseId: z.string(),
      exerciseName: z.string(),
      sets: z.number(),
      reps: z.number().nullable(),
      weightKg: z.number().nullable(),
      timeSec: z.number().nullable(),
      restSec: z.number(),
    }),
  ),
});
export type TemplateResponse = z.infer<typeof templateResponseSchema>;

export const templateListResponseSchema = z.object({
  templates: z.array(templateResponseSchema),
});
export type TemplateListResponse = z.infer<typeof templateListResponseSchema>;
