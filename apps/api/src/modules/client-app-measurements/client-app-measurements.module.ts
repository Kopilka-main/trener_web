import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeMeasurementsRepo } from '../measurements/measurements.repo.js';
import { makeMeasurementsService } from '../measurements/measurements.service.js';
import { clientAppMeasurementsRoutes } from './client-app-measurements.routes.js';

export function registerClientAppMeasurementsModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makeMeasurementsService(makeMeasurementsRepo(deps.db), { newId: deps.clock.newId });
  clientAppMeasurementsRoutes(app, svc, deps.resolveScope);
}
