import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeMeasurementsRepo } from './measurements.repo.js';
import { makeMeasurementsService } from './measurements.service.js';
import { makeClientsRepo } from '../clients/clients.repo.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { measurementsRoutes } from './measurements.routes.js';

// Регистрация доменного модуля measurements в composition root: собирает
// repo+service+guard и навешивает HTTP-роуты. Guard переиспользует clients-repo
// (связь тренер↔клиент). Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerMeasurementsModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock },
): void {
  const repo = makeMeasurementsRepo(deps.db);
  const svc = makeMeasurementsService(repo, { newId: deps.clock.newId });
  const requireClientAccess = makeRequireClientAccess(makeClientsRepo(deps.db));
  measurementsRoutes(app, svc, requireClientAccess);
}
