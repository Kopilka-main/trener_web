import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeAccountingRepo } from './accounting.repo.js';
import { makeAccountingService } from './accounting.service.js';
import { accountingRoutes } from './accounting.routes.js';

// Регистрация доменного модуля accounting в composition root: собирает repo+service
// и навешивает HTTP-роуты (gyms/expenses/incomes + summary). Здесь (НЕ в *.routes.ts)
// допустим импорт repo/db. Верхнеуровневый у тренера, scoped по trainerId.
export function registerAccountingModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock },
): void {
  const repo = makeAccountingRepo(deps.db);
  const svc = makeAccountingService(repo, { newId: deps.clock.newId });
  accountingRoutes(app, svc);
}
