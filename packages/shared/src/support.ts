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
