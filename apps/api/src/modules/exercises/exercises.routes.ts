import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createExerciseRequestSchema,
  updateExerciseRequestSchema,
  exerciseResponseSchema,
  exerciseListResponseSchema,
} from '@trener/shared';
import type { ExercisesService } from './exercises.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { unauthorized } from '../../errors.js';

const idParams = z.object({ id: z.string() });
const exerciseWrap = z.object({ exercise: exerciseResponseSchema });

// HTTP-слой exercises: только роуты. Сборка repo/service — в exercises.module.ts
// (граница слоёв: *.routes.ts не импортирует *.repo/**/db).
// Каталог тренера (глобальный + личный), НЕ вложен под клиента → только requireAuth.
export function exercisesRoutes(app: FastifyInstance, svc: ExercisesService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.get(
    '/api/exercises',
    { preHandler: requireAuth, schema: { response: { 200: exerciseListResponseSchema } } },
    async (req) => ({ exercises: await svc.list(trainerId(req)) }),
  );

  typed.get(
    '/api/exercises/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, response: { 200: exerciseWrap } },
    },
    async (req) => ({ exercise: await svc.get(trainerId(req), req.params.id) }),
  );

  typed.post(
    '/api/exercises',
    {
      preHandler: requireAuth,
      schema: { body: createExerciseRequestSchema, response: { 201: exerciseWrap } },
    },
    async (req, reply) => {
      const exercise = await svc.create(trainerId(req), req.body);
      void reply.status(201);
      return { exercise };
    },
  );

  typed.patch(
    '/api/exercises/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: idParams,
        body: updateExerciseRequestSchema,
        response: { 200: exerciseWrap },
      },
    },
    async (req) => ({ exercise: await svc.update(trainerId(req), req.params.id, req.body) }),
  );

  typed.delete(
    '/api/exercises/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.remove(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );
}
