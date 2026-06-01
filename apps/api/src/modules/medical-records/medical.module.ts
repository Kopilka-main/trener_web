import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { Storage } from '../../files/storage.js';
import { makeMedicalRepo } from './medical.repo.js';
import { makeMedicalService } from './medical.service.js';
import { makeFilesRepo } from '../files/files.repo.js';
import { makeClientsRepo } from '../clients/clients.repo.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { medicalRoutes } from './medical.routes.js';

// Регистрация доменного модуля medical-records в composition root: собирает
// repo+filesRepo+service+guard и навешивает HTTP-роуты. Здесь (НЕ в *.routes.ts)
// допустим импорт repo/db/storage.
export function registerMedicalModule(
  app: FastifyInstance,
  deps: { db: Db; storage: Storage; clock: Clock },
): void {
  const repo = makeMedicalRepo(deps.db);
  const filesRepo = makeFilesRepo(deps.db);
  const svc = makeMedicalService(repo, filesRepo, deps.storage, { newId: deps.clock.newId });
  const requireClientAccess = makeRequireClientAccess(makeClientsRepo(deps.db));
  medicalRoutes(app, svc, requireClientAccess);
}
