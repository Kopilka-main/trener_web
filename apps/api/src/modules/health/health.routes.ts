import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@trener/shared';

export function healthRoutes(app: FastifyInstance): void {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get('/api/health', { schema: { response: { 200: healthResponseSchema } } }, () => ({
      ok: true as const,
      ts: new Date().toISOString(),
    }));
}
