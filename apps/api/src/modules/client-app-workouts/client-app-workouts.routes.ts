import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createWorkoutRequestSchema,
  updateSetRequestSchema,
  completeWorkoutRequestSchema,
  addWorkoutExerciseRequestSchema,
  reorderWorkoutExercisesRequestSchema,
  workoutResponseSchema,
  workoutListResponseSchema,
} from '@trener/shared';
import type { ClientWorkoutsService } from '../client-workouts/client-workouts.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { notFound } from '../../errors.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

const widParams = z.object({ wid: z.string() });
const setParams = z.object({ wid: z.string(), setId: z.string() });
const exerciseParams = z.object({ wid: z.string(), pos: z.coerce.number().int().min(0) });
const workoutWrap = z.object({ workout: workoutResponseSchema });

// Клиентский set-id «position:setIndex» (PATCH .../sets/:setId). Парсим в позицию/индекс.
function parseSetId(setId: string): { position: number; setIndex: number } | null {
  const parts = setId.split(':');
  if (parts.length !== 2) return null;
  const position = Number(parts[0]);
  const setIndex = Number(parts[1]);
  if (!Number.isInteger(position) || position < 0) return null;
  if (!Number.isInteger(setIndex) || setIndex < 0) return null;
  return { position, setIndex };
}

export function clientAppWorkoutsRoutes(
  app: FastifyInstance,
  svc: ClientWorkoutsService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  // Список клиента: свои (любой статус) + тренерские ТОЛЬКО завершённые (owner='all', затем
  // фильтр). Тренерские черновики/активные клиенту не показываем. Секционирование — на фронте.
  typed.get(
    '/api/client/workouts',
    { preHandler: requireClient, schema: { response: { 200: workoutListResponseSchema } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const all = await svc.list(trainerId, clientId, 'all');
      const workouts = all.filter((w) => w.createdByClient || w.status === 'completed');
      return { workouts };
    },
  );

  typed.get(
    '/api/client/workouts/:wid',
    { preHandler: requireClient, schema: { params: widParams, response: { 200: workoutWrap } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const workout = await svc.get(trainerId, clientId, req.params.wid);
      // Клиент видит деталь только своей (любой статус) или завершённой тренерской.
      if (!workout.createdByClient && workout.status !== 'completed')
        throw notFound('Тренировка не найдена');
      return { workout };
    },
  );

  // Создание самостоятельной тренировки (createdByClient=true) → draft.
  typed.post(
    '/api/client/workouts',
    {
      preHandler: requireClient,
      schema: { body: createWorkoutRequestSchema, response: { 201: workoutWrap } },
    },
    async (req, reply) => {
      const { trainerId, clientId } = await scope(req);
      const workout = await svc.create(trainerId, clientId, req.body, true);
      void reply.status(201);
      return { workout };
    },
  );

  // Старт/лог/завершение/удаление — только свои (ownedByClientOnly): тренерская → 404.
  typed.post(
    '/api/client/workouts/:wid/start',
    { preHandler: requireClient, schema: { params: widParams, response: { 200: workoutWrap } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const workout = await svc.start(trainerId, clientId, req.params.wid, {
        ownedByClientOnly: true,
      });
      return { workout };
    },
  );

  typed.patch(
    '/api/client/workouts/:wid/sets/:setId',
    {
      preHandler: requireClient,
      schema: { params: setParams, body: updateSetRequestSchema, response: { 200: workoutWrap } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const parsed = parseSetId(req.params.setId);
      if (!parsed) throw notFound('Подход не найден');
      const workout = await svc.updateSet(
        trainerId,
        clientId,
        req.params.wid,
        parsed.position,
        parsed.setIndex,
        req.body,
        { ownedByClientOnly: true },
      );
      return { workout };
    },
  );

  // Добавить упражнение в свою тренировку (одна позиция: exerciseId + подходы).
  typed.post(
    '/api/client/workouts/:wid/exercises',
    {
      preHandler: requireClient,
      schema: {
        params: widParams,
        body: addWorkoutExerciseRequestSchema,
        response: { 200: workoutWrap },
      },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const workout = await svc.addExercise(trainerId, clientId, req.params.wid, req.body, {
        ownedByClientOnly: true,
      });
      return { workout };
    },
  );

  // Переставить упражнения своей тренировки (order — старые position в новом порядке).
  typed.patch(
    '/api/client/workouts/:wid/exercises',
    {
      preHandler: requireClient,
      schema: {
        params: widParams,
        body: reorderWorkoutExercisesRequestSchema,
        response: { 200: workoutWrap },
      },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const workout = await svc.reorderExercises(
        trainerId,
        clientId,
        req.params.wid,
        req.body.order,
        { ownedByClientOnly: true },
      );
      return { workout };
    },
  );

  // Убрать упражнение из своей тренировки по позиции; остальные перенумеровываются.
  typed.delete(
    '/api/client/workouts/:wid/exercises/:pos',
    {
      preHandler: requireClient,
      schema: { params: exerciseParams, response: { 200: workoutWrap } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const workout = await svc.removeExercise(
        trainerId,
        clientId,
        req.params.wid,
        req.params.pos,
        {
          ownedByClientOnly: true,
        },
      );
      return { workout };
    },
  );

  typed.post(
    '/api/client/workouts/:wid/complete',
    {
      preHandler: requireClient,
      schema: {
        params: widParams,
        body: completeWorkoutRequestSchema,
        response: { 200: workoutWrap },
      },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const workout = await svc.complete(trainerId, clientId, req.params.wid, req.body, {
        ownedByClientOnly: true,
      });
      return { workout };
    },
  );

  typed.delete(
    '/api/client/workouts/:wid',
    {
      preHandler: requireClient,
      schema: { params: widParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      await svc.remove(trainerId, clientId, req.params.wid, { ownedByClientOnly: true });
      return { ok: true as const };
    },
  );
}
