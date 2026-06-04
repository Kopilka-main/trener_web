import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeExercisesRepo } from '../exercises/exercises.repo.js';
import { makeExercisesService } from '../exercises/exercises.service.js';
import { clientAppExercisesRoutes } from './client-app-exercises.routes.js';

export function registerClientAppExercisesModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makeExercisesService(makeExercisesRepo(deps.db), { newId: deps.clock.newId });
  clientAppExercisesRoutes(app, svc, deps.resolveScope);
}
