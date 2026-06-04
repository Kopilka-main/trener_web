import { z } from 'zod';

export const clientStatusSchema = z.enum(['active', 'archived']);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

const name = z.string().trim().min(1).max(100);
const phone = z.string().trim().max(30).nullish();
const notes = z.string().trim().max(2000).nullish();
const accountId = z.string().trim().max(100).nullish();
const birthDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Дата в формате ГГГГ-ММ-ДД')
  .nullish();

const contactSchema = z.object({
  type: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(200),
});
export type Contact = z.infer<typeof contactSchema>;

const contacts = z.array(contactSchema).max(20).default([]);
const tags = z.array(z.string().trim().min(1).max(40)).max(30).default([]);

export const createClientRequestSchema = z.object({
  firstName: name,
  lastName: name,
  phone,
  notes,
  accountId,
  birthDate,
  contacts,
  tags,
});
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const updateClientRequestSchema = z
  .object({
    firstName: name,
    lastName: name,
    phone,
    notes,
    accountId,
    birthDate,
    status: clientStatusSchema,
    contacts,
    tags,
  })
  .partial();
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

export const clientResponseSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  accountId: z.string().nullable(),
  birthDate: z.string().nullable(),
  status: clientStatusSchema,
  contacts: z.array(contactSchema),
  tags: z.array(z.string()),
  // id файла-аватара (раздаётся через GET /api/files/:id) либо null.
  avatarFileId: z.string().nullable(),
  createdAt: z.string(),
});
export type ClientResponse = z.infer<typeof clientResponseSchema>;

export const clientListResponseSchema = z.object({ clients: z.array(clientResponseSchema) });
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;

// Профиль подключённого клиентского аккаунта (для авто-заполнения карточки тренером).
// Email НЕ передаём — это логин аккаунта, а не то, что клиент указал о себе.
export const accountProfileResponseSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().nullable(),
  contacts: z.array(contactSchema),
});
export type AccountProfileResponse = z.infer<typeof accountProfileResponseSchema>;
