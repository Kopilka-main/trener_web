import { z } from 'zod';

const email = z.string().trim().toLowerCase().email();

const contactSchema = z.object({
  type: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(200),
});
export type TrainerContact = z.infer<typeof contactSchema>;

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
  contacts: z.array(contactSchema),
});
export type TrainerResponse = z.infer<typeof trainerResponseSchema>;

export const trainerPublicResponseSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
  contacts: z.array(contactSchema),
});
export type TrainerPublicResponse = z.infer<typeof trainerPublicResponseSchema>;

export const updateTrainerRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().max(200).nullish(),
  bio: z.string().trim().max(2000).nullish(),
  contacts: z.array(contactSchema).max(20).optional(),
});
export type UpdateTrainerRequest = z.infer<typeof updateTrainerRequestSchema>;
