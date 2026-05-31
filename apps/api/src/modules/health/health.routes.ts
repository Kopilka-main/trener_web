import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@trener/shared';

export function healthRoutes(app: FastifyInstance): void {
  app.get('/api/health', (): HealthResponse => {
    return { ok: true, ts: new Date().toISOString() };
  });
}
