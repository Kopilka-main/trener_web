import { z } from 'zod';

export const clientStatusSchema = z.enum(['active', 'archived']);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

const name = z.string().trim().min(1).max(100);
// Фамилия необязательна: пустую строку допускаем и нормализуем в ''.
const lastName = z.string().trim().max(100).default('');
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
  lastName,
  phone,
  notes,
  accountId,
  birthDate,
  contacts,
  tags,
  // Формат: онлайн (true) либо очно/спортзал (false). По умолчанию очно.
  isOnline: z.boolean().default(false),
});
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const updateClientRequestSchema = z
  .object({
    firstName: name,
    lastName,
    phone,
    notes,
    accountId,
    birthDate,
    status: clientStatusSchema,
    contacts,
    tags,
    isOnline: z.boolean(),
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
  // Формат работы: онлайн либо очно (спортзал).
  isOnline: z.boolean(),
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

// Проверка кода привязки: существует ли аккаунт + уже привязанный к нему клиент
// этого тренера (для предупреждения о дубле в записной книжке).
export const connectCodeCheckResponseSchema = z.object({
  exists: z.boolean(),
  linkedClient: z
    .object({ id: z.string(), firstName: z.string(), lastName: z.string() })
    .nullable(),
});
export type ConnectCodeCheckResponse = z.infer<typeof connectCodeCheckResponseSchema>;
