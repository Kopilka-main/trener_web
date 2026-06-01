import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createMeasurementRequestSchema,
  updateMeasurementRequestSchema,
  measurementResponseSchema,
  measurementListResponseSchema,
} from '@trener/shared';
import type { MeasurementsService } from './measurements.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import type { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { unauthorized } from '../../errors.js';

// guard связи тренер↔клиент — импортируем тип из плагина (не repo/db),
// чтобы HTTP-слой не нарушал границу *.routes.ts ↔ *.repo/**/db.
type RequireClientAccess = ReturnType<typeof makeRequireClientAccess>;

const clientParams = z.object({ id: z.string() });
const measurementParams = z.object({ id: z.string(), mid: z.string() });
const measurementWrap = z.object({ measurement: measurementResponseSchema });

// HTTP-слой measurements: вложен под клиента (/api/clients/:id/measurements...).
// Оба preHandler [requireAuth, requireClientAccess]; принадлежность замера паре
// проверяется в repo (scope trainerId+clientId → 404 через service).
// Сборка repo/service/guard — в measurements.module.ts (граница слоёв).
export function measurementsRoutes(
  app: FastifyInstance,
  svc: MeasurementsService,
  requireClientAccess: RequireClientAccess,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [requireAuth, requireClientAccess];

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.post(
    '/api/clients/:id/measurements',
    {
      preHandler,
      schema: {
        params: clientParams,
        body: createMeasurementRequestSchema,
        response: { 201: measurementWrap },
      },
    },
    async (req, reply) => {
      const measurement = await svc.create(trainerId(req), req.params.id, req.body);
      void reply.status(201);
      return { measurement };
    },
  );

  typed.get(
    '/api/clients/:id/measurements',
    {
      preHandler,
      schema: { params: clientParams, response: { 200: measurementListResponseSchema } },
    },
    async (req) => ({ measurements: await svc.list(trainerId(req), req.params.id) }),
  );

  typed.get(
    '/api/clients/:id/measurements/:mid',
    {
      preHandler,
      schema: { params: measurementParams, response: { 200: measurementWrap } },
    },
    async (req) => ({
      measurement: await svc.get(trainerId(req), req.params.id, req.params.mid),
    }),
  );

  typed.patch(
    '/api/clients/:id/measurements/:mid',
    {
      preHandler,
      schema: {
        params: measurementParams,
        body: updateMeasurementRequestSchema,
        response: { 200: measurementWrap },
      },
    },
    async (req) => ({
      measurement: await svc.update(trainerId(req), req.params.id, req.params.mid, req.body),
    }),
  );

  typed.delete(
    '/api/clients/:id/measurements/:mid',
    {
      preHandler,
      schema: { params: measurementParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.remove(trainerId(req), req.params.id, req.params.mid);
      return { ok: true as const };
    },
  );
}
