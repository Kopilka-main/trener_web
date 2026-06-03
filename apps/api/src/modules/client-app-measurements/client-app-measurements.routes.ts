import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createMeasurementRequestSchema,
  updateMeasurementRequestSchema,
  measurementResponseSchema,
  measurementListResponseSchema,
} from '@trener/shared';
import type { MeasurementsService } from '../measurements/measurements.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

const midParams = z.object({ mid: z.string().min(1) });
const measurementWrap = z.object({ measurement: measurementResponseSchema });
const okResponse = z.object({ ok: z.literal(true) });

export function clientAppMeasurementsRoutes(
  app: FastifyInstance,
  svc: MeasurementsService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/measurements',
    { preHandler: requireClient, schema: { response: { 200: measurementListResponseSchema } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { measurements: await svc.list(trainerId, clientId) };
    },
  );

  typed.post(
    '/api/client/measurements',
    {
      preHandler: requireClient,
      schema: { body: createMeasurementRequestSchema, response: { 201: measurementWrap } },
    },
    async (req, reply) => {
      const { trainerId, clientId } = await scope(req);
      const measurement = await svc.create(trainerId, clientId, req.body);
      void reply.status(201);
      return { measurement };
    },
  );

  typed.patch(
    '/api/client/measurements/:mid',
    {
      preHandler: requireClient,
      schema: {
        params: midParams,
        body: updateMeasurementRequestSchema,
        response: { 200: measurementWrap },
      },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { measurement: await svc.update(trainerId, clientId, req.params.mid, req.body) };
    },
  );

  typed.delete(
    '/api/client/measurements/:mid',
    {
      preHandler: requireClient,
      schema: { params: midParams, response: { 200: okResponse } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      await svc.remove(trainerId, clientId, req.params.mid);
      return { ok: true as const };
    },
  );
}
