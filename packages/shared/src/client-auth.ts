import { z } from 'zod';

const email = z.string().trim().toLowerCase().email();

export const clientRegisterRequestSchema = z.object({
  email,
  password: z.string().min(8, 'Пароль не короче 8 символов').max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});
export type ClientRegisterRequest = z.infer<typeof clientRegisterRequestSchema>;

export const clientLoginRequestSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type ClientLoginRequest = z.infer<typeof clientLoginRequestSchema>;

export const clientAccountResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarFileId: z.string().nullable(),
});
export type ClientAccountResponse = z.infer<typeof clientAccountResponseSchema>;

/** Привязка клиента к тренеру: null = аккаунт ещё не подключён ни одним тренером. */
export const clientLinkSchema = z
  .object({ trainerId: z.string(), clientId: z.string() })
  .nullable();
export type ClientLink = z.infer<typeof clientLinkSchema>;

export const clientMeResponseSchema = z.object({
  account: clientAccountResponseSchema,
  link: clientLinkSchema,
});
export type ClientMeResponse = z.infer<typeof clientMeResponseSchema>;
