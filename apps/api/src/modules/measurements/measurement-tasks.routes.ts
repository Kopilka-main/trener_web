import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createMeasurementTaskSchema,
  measurementTaskResponseSchema,
  measurementTaskListResponseSchema,
} from '@trener/shared';
import type { MeasurementTasksService } from './measurement-tasks.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import type { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { unauthorized } from '../../errors.js';

type RequireClientAccess = ReturnType<typeof makeRequireClientAccess>;

const clientParams = z.object({ id: z.string() });
const taskParams = z.object({ id: z.string(), tid: z.string() });
const taskWrap = z.object({ task: measurementTaskResponseSchema });

// HTTP-слой задач на замеры (тренер): /api/clients/:id/measurement-tasks...
export function measurementTasksRoutes(
  app: FastifyInstance,
  svc: MeasurementTasksService,
  requireClientAccess: RequireClientAccess,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [requireAuth, requireClientAccess];

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.post(
    '/api/clients/:id/measurement-tasks',
    {
      preHandler,
      schema: {
        params: clientParams,
        body: createMeasurementTaskSchema,
        response: { 201: taskWrap },
      },
    },
    async (req, reply) => {
      const task = await svc.create(trainerId(req), req.params.id, req.body);
      void reply.status(201);
      return { task };
    },
  );

  typed.get(
    '/api/clients/:id/measurement-tasks',
    {
      preHandler,
      schema: { params: clientParams, response: { 200: measurementTaskListResponseSchema } },
    },
    async (req) => ({ tasks: await svc.listOpen(trainerId(req), req.params.id) }),
  );

  typed.delete(
    '/api/clients/:id/measurement-tasks/:tid',
    {
      preHandler,
      schema: { params: taskParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.cancel(trainerId(req), req.params.id, req.params.tid);
      return { ok: true as const };
    },
  );
}
