import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeCalendarRepo } from './calendar.repo.js';
import { makeCalendarService } from './calendar.service.js';
import { calendarRoutes } from './calendar.routes.js';

// Регистрация доменного модуля calendar в composition root: собирает repo+service
// и навешивает HTTP-роуты. Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerCalendarModule(app: FastifyInstance, deps: { db: Db; clock: Clock }): void {
  const repo = makeCalendarRepo(deps.db);
  const svc = makeCalendarService(repo, deps.clock);
  calendarRoutes(app, svc);
}
