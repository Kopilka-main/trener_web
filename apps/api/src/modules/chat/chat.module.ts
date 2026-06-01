import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeChatRepo } from './chat.repo.js';
import { makeChatService } from './chat.service.js';
import { makeClientsRepo } from '../clients/clients.repo.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { chatRoutes } from './chat.routes.js';

// Регистрация доменного модуля chat в composition root: собирает repo+service+guard
// и навешивает HTTP-роуты. Guard переиспользует clients-repo (связь тренер↔клиент).
// Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerChatModule(app: FastifyInstance, deps: { db: Db; clock: Clock }): void {
  const repo = makeChatRepo(deps.db);
  const svc = makeChatService(repo, { newId: deps.clock.newId, now: deps.clock.now });
  const requireClientAccess = makeRequireClientAccess(makeClientsRepo(deps.db));
  chatRoutes(app, svc, requireClientAccess);
}
