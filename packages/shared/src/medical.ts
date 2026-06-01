import { z } from 'zod';
import { fileResponseSchema } from './files.js';

// Поля date/note приходят multipart-частями вместе с опциональным файлом `file`,
// поэтому отдельной create-body-схемы для type-provider нет — роут валидирует
// поля вручную через zod (регэксп даты + trim note).

// --- Запрос на обновление (PATCH, JSON body, НЕ multipart) ---

// Частичное обновление: можно менять дату и/или заметку. Файл через PATCH не трогаем.
export const updateMedicalRecordRequestSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().trim().min(1).max(4000).optional(),
});
export type UpdateMedicalRecordRequest = z.infer<typeof updateMedicalRecordRequestSchema>;

// --- Ответы ---

// Запись медкарты с опциональным привязанным файлом (file: fileResponseSchema | null).
export const medicalRecordResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  date: z.string(),
  note: z.string(),
  file: fileResponseSchema.nullable(),
  createdAt: z.string(),
});
export type MedicalRecordResponse = z.infer<typeof medicalRecordResponseSchema>;

export const medicalRecordListResponseSchema = z.object({
  records: z.array(medicalRecordResponseSchema),
});
export type MedicalRecordListResponse = z.infer<typeof medicalRecordListResponseSchema>;
