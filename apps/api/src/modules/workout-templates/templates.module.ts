import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeTemplatesRepo } from './templates.repo.js';
import { makeTemplatesService } from './templates.service.js';
import { templatesRoutes } from './templates.routes.js';

// Регистрация доменного модуля workout-templates в composition root: собирает
// repo+service и навешивает HTTP-роуты. Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerTemplatesModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock },
): void {
  const repo = makeTemplatesRepo(deps.db);
  const svc = makeTemplatesService(repo, { newId: deps.clock.newId });
  templatesRoutes(app, svc);
}
