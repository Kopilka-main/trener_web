import { z } from 'zod';

const text200 = z.string().trim().max(200).nullish();

export const sessionStatusSchema = z.enum(['planned', 'completed', 'cancelled']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const clientConfirmationSchema = z.enum(['pending', 'confirmed', 'declined']);
export type ClientConfirmation = z.infer<typeof clientConfirmationSchema>;

// --- Создание занятия ---

export const createSessionRequestSchema = z.object({
  clientId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  startTime: z.string().regex(/^\d{2}:\d{2}$/), // HH:MM
  durationMin: z.number().int().positive().default(60),
  location: text200,
  title: text200,
  isOnline: z.boolean().default(false),
  workoutId: z.string().nullish(),
});
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

// --- Обновление занятия (частичное + смена статуса) ---

// .partial() наследовал бы .default(60) у durationMin (PATCH без поля → молча 60).
// Переопределяем durationMin как optional без default, чтобы патч не подменял длительность.
export const updateSessionRequestSchema = createSessionRequestSchema.partial().extend({
  durationMin: z.number().int().positive().optional(),
  status: sessionStatusSchema.optional(),
});
export type UpdateSessionRequest = z.infer<typeof updateSessionRequestSchema>;

// --- Подтверждение/отклонение занятия клиентом ---
export const clientSessionConfirmRequestSchema = z.object({
  status: z.enum(['confirmed', 'declined']),
});
export type ClientSessionConfirmRequest = z.infer<typeof clientSessionConfirmRequestSchema>;

// --- Ответы ---

export const sessionResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  workoutId: z.string().nullable(),
  date: z.string(),
  startTime: z.string(),
  durationMin: z.number(),
  location: z.string().nullable(),
  title: z.string().nullable(),
  status: sessionStatusSchema,
  isOnline: z.boolean(),
  note: z.string().nullable(),
  clientConfirmation: clientConfirmationSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const sessionListResponseSchema = z.object({
  sessions: z.array(sessionResponseSchema),
});
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
