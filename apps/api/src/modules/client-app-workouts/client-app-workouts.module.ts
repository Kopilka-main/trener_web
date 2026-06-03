import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeClientWorkoutsRepo } from '../client-workouts/client-workouts.repo.js';
import { makeClientWorkoutsService } from '../client-workouts/client-workouts.service.js';
import { clientAppWorkoutsRoutes } from './client-app-workouts.routes.js';

export function registerClientAppWorkoutsModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makeClientWorkoutsService(makeClientWorkoutsRepo(deps.db), {
    newId: deps.clock.newId,
    now: deps.clock.now,
  });
  clientAppWorkoutsRoutes(app, svc, deps.resolveScope);
}
