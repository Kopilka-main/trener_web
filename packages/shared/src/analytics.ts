import { z } from 'zod';

// Контракт батч-приёма аналитики экранов: приложение (тренер/клиент) шлёт лог
// «какой экран открывали и сколько секунд». Одна отправка = одна сессия + события.
export const analyticsIngestRequestSchema = z.object({
  sessionId: z.string().min(1).max(64),
  appVersion: z.string().max(32).nullish(),
  platform: z.string().max(32).nullish(),
  events: z
    .array(
      z.object({
        screen: z.string().min(1).max(80),
        seconds: z.number().int().min(0).max(86400),
        enteredAt: z.string().datetime(),
      }),
    )
    .min(1)
    .max(500),
});
export type AnalyticsIngestRequest = z.infer<typeof analyticsIngestRequestSchema>;
