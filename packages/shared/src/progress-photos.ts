import { z } from 'zod';
import { fileResponseSchema } from './files.js';

// Ракурс фото прогресса: фронт/бок/спина.
export const angleSchema = z.enum(['front', 'side', 'back']);
export type Angle = z.infer<typeof angleSchema>;

// Поля angle/date/note приходят multipart-частями вместе с файлом `photo`,
// поэтому отдельной create-body-схемы для type-provider нет — роут валидирует
// поля вручную через zod (angleSchema + регэксп даты).

// --- Ответы ---

// Фото прогресса с метаданными привязанного файла (file: fileResponseSchema).
export const photoResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  date: z.string(),
  angle: angleSchema,
  note: z.string().nullable(),
  file: fileResponseSchema,
  createdAt: z.string(),
});
export type PhotoResponse = z.infer<typeof photoResponseSchema>;

export const photoListResponseSchema = z.object({
  photos: z.array(photoResponseSchema),
});
export type PhotoListResponse = z.infer<typeof photoListResponseSchema>;
