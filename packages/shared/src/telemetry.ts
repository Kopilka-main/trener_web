import { z } from 'zod';

export const telemetrySourceSchema = z.enum(['client', 'trainer']);
export type TelemetrySource = z.infer<typeof telemetrySourceSchema>;

// Значение props/context: только примитив (сложное отбросит сервер).
const propValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

export const analyticsEventInputSchema = z.object({
  name: z.string().min(1).max(64),
  path: z.string().max(512).nullish(),
  props: z.record(propValue).optional(),
});
export type AnalyticsEventInput = z.infer<typeof analyticsEventInputSchema>;

export const analyticsBatchRequestSchema = z.object({
  source: telemetrySourceSchema,
  sessionId: z.string().min(1).max(64),
  events: z.array(analyticsEventInputSchema).max(50),
});
export type AnalyticsBatchRequest = z.infer<typeof analyticsBatchRequestSchema>;

export const clientErrorInputSchema = z.object({
  name: z.string().max(200).nullish(),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).nullish(),
  path: z.string().max(512).nullish(),
  context: z.record(propValue).optional(),
});
export type ClientErrorInput = z.infer<typeof clientErrorInputSchema>;

export const clientErrorBatchRequestSchema = z.object({
  source: telemetrySourceSchema,
  sessionId: z.string().max(64).nullish(),
  errors: z.array(clientErrorInputSchema).max(20),
});
export type ClientErrorBatchRequest = z.infer<typeof clientErrorBatchRequestSchema>;

export const telemetryAcceptResponseSchema = z.object({
  ok: z.literal(true),
  accepted: z.number().int(),
});
export type TelemetryAcceptResponse = z.infer<typeof telemetryAcceptResponseSchema>;
