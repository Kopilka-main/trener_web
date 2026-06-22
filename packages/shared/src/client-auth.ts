import { z } from 'zod';

const email = z.string().trim().toLowerCase().email();

const contactSchema = z.object({
  type: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(200),
});

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

export const updateClientAccountRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Дата в формате ГГГГ-ММ-ДД')
    .nullish(),
  contacts: z.array(contactSchema).max(20).optional(),
  bio: z.string().trim().max(2000).nullish(),
});
export type UpdateClientAccountRequest = z.infer<typeof updateClientAccountRequestSchema>;

export const clientAccountResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarFileId: z.string().nullable(),
  birthDate: z.string().nullable(),
  contacts: z.array(contactSchema),
  bio: z.string().nullable(),
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
  // ISO-момент окончательного удаления аккаунта (окно отмены), либо null.
  pendingDeletionAt: z.string().nullable(),
});
export type ClientMeResponse = z.infer<typeof clientMeResponseSchema>;
