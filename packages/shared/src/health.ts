import { z } from 'zod';

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  ts: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
