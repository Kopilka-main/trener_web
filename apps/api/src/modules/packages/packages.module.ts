import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makePackagesRepo } from './packages.repo.js';
import { makePackagesService } from './packages.service.js';
import { makeClientsRepo } from '../clients/clients.repo.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { packagesRoutes } from './packages.routes.js';

// Регистрация доменного модуля packages в composition root: собирает
// repo+service+guard и навешивает HTTP-роуты. Guard переиспользует clients-repo
// (связь тренер↔клиент). Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerPackagesModule(app: FastifyInstance, deps: { db: Db; clock: Clock }): void {
  const repo = makePackagesRepo(deps.db);
  const svc = makePackagesService(repo, { newId: deps.clock.newId });
  const requireClientAccess = makeRequireClientAccess(makeClientsRepo(deps.db));
  packagesRoutes(app, svc, requireClientAccess);
}
