import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeSessionsRepo } from './sessions.repo.js';
import { makeSessionsService } from './sessions.service.js';
import { sessionsRoutes } from './sessions.routes.js';

// Регистрация доменного модуля sessions в composition root: собирает repo+service
// и навешивает HTTP-роуты. Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
// Проверку связи клиента repo делает прямым запросом к trainer_clients (без зависимости от clients.repo).
export function registerSessionsModule(app: FastifyInstance, deps: { db: Db; clock: Clock }): void {
  const repo = makeSessionsRepo(deps.db);
  const svc = makeSessionsService(repo, { newId: deps.clock.newId });
  sessionsRoutes(app, svc);
}
