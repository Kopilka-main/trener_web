import { z } from 'zod';

// Метаданные загруженного файла. Сам контент раздаётся через GET /api/files/:id
// (приватно, только владельцу-тренеру). URL клиент строит из id.
export const fileResponseSchema = z.object({
  id: z.string(),
  mime: z.string(),
  sizeBytes: z.number(),
  originalName: z.string().nullable(),
  createdAt: z.string(),
});
export type FileResponse = z.infer<typeof fileResponseSchema>;
