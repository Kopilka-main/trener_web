import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeSessionsRepo } from '../sessions/sessions.repo.js';
import { makeSessionsService } from '../sessions/sessions.service.js';
import { clientAppCalendarRoutes } from './client-app-calendar.routes.js';

export function registerClientAppCalendarModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makeSessionsService(makeSessionsRepo(deps.db), { newId: deps.clock.newId });
  clientAppCalendarRoutes(app, svc, deps.resolveScope);
}
