import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createWorkoutRequestSchema,
  updateSetRequestSchema,
  completeWorkoutRequestSchema,
  addWorkoutExerciseRequestSchema,
  addWorkoutSetRequestSchema,
  addWorkoutToHistoryRequestSchema,
  reorderWorkoutExercisesRequestSchema,
  importWorkoutRequestSchema,
  workoutResponseSchema,
  workoutListResponseSchema,
} from '@trener/shared';
import type { ClientWorkoutsService } from './client-workouts.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import type { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { unauthorized } from '../../errors.js';

// guard связи тренер↔клиент — импортируем тип из плагина (не repo/db),
// чтобы HTTP-слой не нарушал границу *.routes.ts ↔ *.repo/**/db.
type RequireClientAccess = ReturnType<typeof makeRequireClientAccess>;

const clientParams = z.object({ id: z.string() });
const workoutParams = z.object({ id: z.string(), wid: z.string() });
const setParams = z.object({
  id: z.string(),
  wid: z.string(),
  pos: z.coerce.number().int().min(0),
  idx: z.coerce.number().int().min(0),
});
const exerciseParams = z.object({
  id: z.string(),
  wid: z.string(),
  pos: z.coerce.number().int().min(0),
});
const workoutWrap = z.object({ workout: workoutResponseSchema });

// HTTP-слой client-workouts: вложен под клиента (/api/clients/:id/workouts...).
// Оба preHandler [requireAuth, requireClientAccess]; принадлежность тренировки паре
// проверяется в repo (scope trainerId+clientId → 404 через service).
// Сборка repo/service/guard — в client-workouts.module.ts (граница слоёв).
export function clientWorkoutsRoutes(
  app: FastifyInstance,
  svc: ClientWorkoutsService,
  requireClientAccess: RequireClientAccess,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [requireAuth, requireClientAccess];

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.post(
    '/api/clients/:id/workouts',
    {
      preHandler,
      schema: {
        params: clientParams,
        body: createWorkoutRequestSchema,
        response: { 201: workoutWrap },
      },
    },
    async (req, reply) => {
      const workout = await svc.create(trainerId(req), req.params.id, req.body);
      void reply.status(201);
      return { workout };
    },
  );

  // Идемпотентный импорт целиком офлайн-проведённой (или пропущенной) тренировки:
  // повторная отправка с тем же idempotencyKey возвращает уже созданную запись.
  typed.post(
    '/api/clients/:id/workouts/import',
    {
      preHandler,
      schema: {
        params: clientParams,
        body: importWorkoutRequestSchema,
        response: { 200: workoutWrap },
      },
    },
    async (req) => ({
      workout: await svc.import(trainerId(req), req.params.id, req.body),
    }),
  );

  typed.get(
    '/api/clients/:id/workouts',
    {
      preHandler,
      schema: { params: clientParams, response: { 200: workoutListResponseSchema } },
    },
    // Тренер видит только тренерские тренировки клиента (не самостоятельные).
    async (req) => ({ workouts: await svc.list(trainerId(req), req.params.id, 'trainer') }),
  );

  typed.get(
    '/api/clients/:id/workouts/:wid',
    {
      preHandler,
      schema: { params: workoutParams, response: { 200: workoutWrap } },
    },
    async (req) => ({ workout: await svc.get(trainerId(req), req.params.id, req.params.wid) }),
  );

  typed.post(
    '/api/clients/:id/workouts/:wid/start',
    {
      preHandler,
      schema: { params: workoutParams, response: { 200: workoutWrap } },
    },
    async (req) => ({ workout: await svc.start(trainerId(req), req.params.id, req.params.wid) }),
  );

  // Зафиксировать тренировку в истории клиента указанной датой (постфактум):
  // не запускается, не учитывается в балансе пакета, не попадает в календарь.
  typed.post(
    '/api/clients/:id/workouts/:wid/add-to-history',
    {
      preHandler,
      schema: {
        params: workoutParams,
        body: addWorkoutToHistoryRequestSchema,
        response: { 200: workoutWrap },
      },
    },
    async (req) => ({
      workout: await svc.addToHistory(trainerId(req), req.params.id, req.params.wid, req.body.date),
    }),
  );

  typed.patch(
    '/api/clients/:id/workouts/:wid/exercises/:pos/sets/:idx',
    {
      preHandler,
      schema: { params: setParams, body: updateSetRequestSchema, response: { 200: workoutWrap } },
    },
    async (req) => ({
      workout: await svc.updateSet(
        trainerId(req),
        req.params.id,
        req.params.wid,
        req.params.pos,
        req.params.idx,
        req.body,
      ),
    }),
  );

  typed.post(
    '/api/clients/:id/workouts/:wid/exercises/:pos/sets',
    {
      preHandler,
      schema: {
        params: exerciseParams,
        body: addWorkoutSetRequestSchema,
        response: { 200: workoutWrap },
      },
    },
    async (req) => ({
      workout: await svc.addSet(
        trainerId(req),
        req.params.id,
        req.params.wid,
        req.params.pos,
        req.body,
      ),
    }),
  );

  typed.delete(
    '/api/clients/:id/workouts/:wid/exercises/:pos/sets/:idx',
    {
      preHandler,
      schema: { params: setParams, response: { 200: workoutWrap } },
    },
    async (req) => ({
      workout: await svc.deleteSet(
        trainerId(req),
        req.params.id,
        req.params.wid,
        req.params.pos,
        req.params.idx,
      ),
    }),
  );

  typed.post(
    '/api/clients/:id/workouts/:wid/exercises',
    {
      preHandler,
      schema: {
        params: workoutParams,
        body: addWorkoutExerciseRequestSchema,
        response: { 200: workoutWrap },
      },
    },
    async (req) => ({
      workout: await svc.addExercise(trainerId(req), req.params.id, req.params.wid, req.body),
    }),
  );

  typed.delete(
    '/api/clients/:id/workouts/:wid/exercises/:pos',
    {
      preHandler,
      schema: { params: exerciseParams, response: { 200: workoutWrap } },
    },
    async (req) => ({
      workout: await svc.removeExercise(
        trainerId(req),
        req.params.id,
        req.params.wid,
        req.params.pos,
      ),
    }),
  );

  typed.patch(
    '/api/clients/:id/workouts/:wid/exercises',
    {
      preHandler,
      schema: {
        params: workoutParams,
        body: reorderWorkoutExercisesRequestSchema,
        response: { 200: workoutWrap },
      },
    },
    async (req) => ({
      workout: await svc.reorderExercises(
        trainerId(req),
        req.params.id,
        req.params.wid,
        req.body.order,
      ),
    }),
  );

  typed.post(
    '/api/clients/:id/workouts/:wid/complete',
    {
      preHandler,
      schema: {
        params: workoutParams,
        body: completeWorkoutRequestSchema,
        response: { 200: workoutWrap },
      },
    },
    async (req) => ({
      workout: await svc.complete(trainerId(req), req.params.id, req.params.wid, req.body),
    }),
  );

  typed.delete(
    '/api/clients/:id/workouts/:wid',
    {
      preHandler,
      schema: { params: workoutParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.remove(trainerId(req), req.params.id, req.params.wid);
      return { ok: true as const };
    },
  );
}
