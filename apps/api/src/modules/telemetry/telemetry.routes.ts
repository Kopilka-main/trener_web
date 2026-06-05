import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  analyticsBatchRequestSchema,
  clientErrorBatchRequestSchema,
  telemetryAcceptResponseSchema,
} from '@trener/shared';
import type { TelemetryService, Actor } from './telemetry.service.js';

function actorOf(req: FastifyRequest): Actor {
  if (req.trainerId) return { actorType: 'trainer', actorId: req.trainerId };
  if (req.clientAccountId) return { actorType: 'client', actorId: req.clientAccountId };
  return { actorType: 'anon', actorId: null };
}

export function telemetryRoutes(app: FastifyInstance, svc: TelemetryService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/telemetry/events',
    {
      schema: {
        body: analyticsBatchRequestSchema,
        response: { 200: telemetryAcceptResponseSchema },
      },
    },
    async (req) => {
      const ua = req.headers['user-agent'] ?? null;
      let accepted = 0;
      try {
        accepted = await svc.ingestEvents(req.body, actorOf(req), ua);
      } catch (err) {
        req.log.warn({ err }, 'telemetry events ingest failed');
      }
      return { ok: true as const, accepted };
    },
  );

  typed.post(
    '/api/telemetry/errors',
    {
      schema: {
        body: clientErrorBatchRequestSchema,
        response: { 200: telemetryAcceptResponseSchema },
      },
    },
    async (req) => {
      const ua = req.headers['user-agent'] ?? null;
      let accepted = 0;
      try {
        accepted = await svc.ingestClientErrors(req.body, actorOf(req), ua);
      } catch (err) {
        req.log.warn({ err }, 'telemetry errors ingest failed');
      }
      return { ok: true as const, accepted };
    },
  );
}
