import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeSessionsRepo } from '../sessions/sessions.repo.js';
import { makeSessionsService } from '../sessions/sessions.service.js';
import { clientAppCalendarRoutes } from './client-app-calendar.routes.js';

export function registerClientAppCalendarModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    clock: Clock;
    resolveScope: (id: string) => Promise<ClientLink>;
    // Клиент подтвердил/отклонил занятие → пуш тренеру (fire-and-forget).
    notifyTrainerConfirmation?: (
      trainerId: string,
      payload: { title: string; body: string; url?: string },
    ) => void;
  },
): void {
  const svc = makeSessionsService(makeSessionsRepo(deps.db), {
    newId: deps.clock.newId,
    ...(deps.notifyTrainerConfirmation
      ? { notifyTrainerConfirmation: deps.notifyTrainerConfirmation }
      : {}),
  });
  clientAppCalendarRoutes(app, svc, deps.resolveScope);
}
