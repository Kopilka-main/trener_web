import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createMeasurementRequestSchema,
  updateMeasurementRequestSchema,
  measurementResponseSchema,
  measurementListResponseSchema,
  measurementTaskListResponseSchema,
} from '@trener/shared';
import type { MeasurementsService } from '../measurements/measurements.service.js';
import type { MeasurementTasksService } from '../measurements/measurement-tasks.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

const midParams = z.object({ mid: z.string().min(1) });
const measurementWrap = z.object({ measurement: measurementResponseSchema });
const okResponse = z.object({ ok: z.literal(true) });

// Структурно совпадает с push PushPayload (HTTP-слой не импортирует push-модуль).
type TrainerPushPayload = { title: string; body: string; url?: string };

export function clientAppMeasurementsRoutes(
  app: FastifyInstance,
  svc: MeasurementsService,
  tasksSvc: MeasurementTasksService,
  resolveScope: ResolveScope,
  // Пуш ТРЕНЕРУ при добавлении замера клиентом (fire-and-forget, опционален).
  notifyTrainer?: (
    trainerId: string,
    clientId: string,
    build: (clientName: string) => TrainerPushPayload,
  ) => void,
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

  // Открытые задачи на замеры (для уведомления клиенту, пока не внесёт замер).
  typed.get(
    '/api/client/measurement-tasks',
    { preHandler: requireClient, schema: { response: { 200: measurementTaskListResponseSchema } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { tasks: await tasksSvc.listOpen(trainerId, clientId) };
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
      // Уведомить тренера: клиент добавил замеры. Fire-and-forget.
      if (notifyTrainer) {
        notifyTrainer(trainerId, clientId, (clientName) => ({
          title: clientName,
          body: 'Добавил замеры',
          url: `/clients/${clientId}`,
        }));
      }
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
