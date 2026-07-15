import { z } from 'zod';

const appEntrySchema = z.object({
  minBuild: z.number().int(), // минимально допустимый номер сборки; ниже — форс-обновление
  android: z.string(), // ссылка на Google Play
  ios: z.string(), // ссылка на App Store
});

export const appInfoResponseSchema = z.object({
  trainer: appEntrySchema,
  client: appEntrySchema,
});

export type AppInfoResponse = z.infer<typeof appInfoResponseSchema>;
