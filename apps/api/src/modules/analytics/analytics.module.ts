import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { ClientLink } from '@trener/shared';
import { makeAnalyticsRepo } from './analytics.repo.js';
import { analyticsRoutes } from './analytics.routes.js';

// Регистрация модуля аналитики экранов в composition root: собирает repo и навешивает
// HTTP-роуты. adminKey (ANALYTICS_ADMIN_KEY) читается из env в app.ts; пустой → GET
// /api/analytics/sessions вернёт 503. Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerAnalyticsModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    newId: () => string;
    resolveScope: (id: string) => Promise<ClientLink>;
    adminKey?: string;
  },
): void {
  const repo = makeAnalyticsRepo(deps.db);
  analyticsRoutes(app, repo, deps.newId, deps.resolveScope, deps.adminKey);
}
