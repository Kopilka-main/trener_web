import { z } from 'zod';

// Обращение в поддержку: единый контракт для тренерского и клиентского приложений.
// На него сядут мобильные клиенты — менять поля осторожно.

export const submitSupportRequestSchema = z.object({
  text: z.string().min(1).max(5000),
});
export type SubmitSupportRequest = z.infer<typeof submitSupportRequestSchema>;

export const submitSupportResponseSchema = z.object({
  ok: z.boolean(),
});
export type SubmitSupportResponse = z.infer<typeof submitSupportResponseSchema>;

// Переписка с поддержкой (двусторонняя): обращения пользователя (direction 'in') и
// ответы саппорта (direction 'out') одной ленты, по возрастанию времени. createdAt — ISO.
export const supportThreadMessageSchema = z.object({
  id: z.string(),
  direction: z.enum(['in', 'out']),
  text: z.string(),
  createdAt: z.string(),
  // Вложение обращения (картинка/файл), если было. null/undefined — текстовое сообщение.
  // fileId раздаётся защищённой раздачей GET /api/files/:id; kind различает превью
  // (image) от скачивания (file); name — оригинальное имя для отображения/скачивания.
  attachment: z
    .object({ fileId: z.string(), kind: z.enum(['image', 'file']), name: z.string() })
    .nullish(),
});
export type SupportThreadMessage = z.infer<typeof supportThreadMessageSchema>;

export const supportThreadResponseSchema = z.object({
  messages: z.array(supportThreadMessageSchema),
});
export type SupportThreadResponse = z.infer<typeof supportThreadResponseSchema>;
