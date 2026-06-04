import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeClientTemplatesRepo } from './client-app-templates.repo.js';
import { makeClientTemplatesService } from './client-app-templates.service.js';
import { clientAppTemplatesRoutes } from './client-app-templates.routes.js';

export function registerClientAppTemplatesModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makeClientTemplatesService(makeClientTemplatesRepo(deps.db), {
    newId: deps.clock.newId,
  });
  clientAppTemplatesRoutes(app, svc, deps.resolveScope);
}
