import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { errorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './modules/health/health.routes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  const typed = app.withTypeProvider<ZodTypeProvider>();
  healthRoutes(typed);
  return app;
}
