import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { exerciseListResponseSchema } from '@trener/shared';
import type { ExercisesService } from '../exercises/exercises.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

export function clientAppExercisesRoutes(
  app: FastifyInstance,
  svc: ExercisesService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/exercises',
    { preHandler: requireClient, schema: { response: { 200: exerciseListResponseSchema } } },
    async (req) => {
      const { trainerId } = await scope(req);
      return { exercises: await svc.list(trainerId) };
    },
  );
}
