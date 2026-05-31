import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './modules/health/health.routes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  app.setErrorHandler(errorHandler);
  healthRoutes(app);
  return app;
}
