import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { ClientLink } from '@trener/shared';
import { makeAuthRepo } from '../auth/auth.repo.js';
import { clientAppTrainerRoutes } from './client-app-trainer.routes.js';

export function registerClientAppTrainerModule(
  app: FastifyInstance,
  deps: { db: Db; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  clientAppTrainerRoutes(app, makeAuthRepo(deps.db), deps.resolveScope);
}
