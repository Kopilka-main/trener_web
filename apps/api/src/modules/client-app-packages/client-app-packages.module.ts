import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makePackagesRepo } from '../packages/packages.repo.js';
import { makePackagesService } from '../packages/packages.service.js';
import { clientAppPackagesRoutes } from './client-app-packages.routes.js';

export function registerClientAppPackagesModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makePackagesService(makePackagesRepo(deps.db), { newId: deps.clock.newId });
  clientAppPackagesRoutes(app, svc, deps.resolveScope);
}
