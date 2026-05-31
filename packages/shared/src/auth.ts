import { z } from 'zod';

const email = z.string().trim().toLowerCase().email();

export const registerRequestSchema = z.object({
  email,
  password: z.string().min(8, 'Пароль не короче 8 символов').max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const trainerResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
});
export type TrainerResponse = z.infer<typeof trainerResponseSchema>;
