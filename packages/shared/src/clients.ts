import { z } from 'zod';

export const clientStatusSchema = z.enum(['active', 'archived']);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

const name = z.string().trim().min(1).max(100);
const phone = z.string().trim().max(30).nullish();
const notes = z.string().trim().max(2000).nullish();
const accountId = z.string().trim().max(100).nullish();

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
  status: clientStatusSchema,
  contacts: z.array(contactSchema),
  tags: z.array(z.string()),
  createdAt: z.string(),
});
export type ClientResponse = z.infer<typeof clientResponseSchema>;

export const clientListResponseSchema = z.object({ clients: z.array(clientResponseSchema) });
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;
