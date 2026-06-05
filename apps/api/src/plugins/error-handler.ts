import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../errors.js';

export type ErrorRecord = {
  message: string;
  name?: string | null;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  actorType: 'trainer' | 'client' | 'anon';
  actorId: string | null;
  context?: Record<string, unknown>;
};
export type ErrorRecorder = (e: ErrorRecord) => void;

export function makeErrorHandler(opts: { recordError?: ErrorRecorder } = {}) {
  return function errorHandler(
    error: FastifyError | AppError | ZodError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    if (hasZodFastifySchemaValidationErrors(error)) {
      void reply
        .status(400)
        .send({ error: 'Ошибка валидации', code: 'VALIDATION_ERROR', details: error.validation });
      return;
    }
    if (error instanceof AppError) {
      void reply
        .status(error.status)
        .send({ error: error.message, code: error.code, details: error.details });
      return;
    }
    if (error instanceof ZodError) {
      void reply
        .status(400)
        .send({ error: 'Ошибка валидации', code: 'VALIDATION_ERROR', details: error.flatten() });
      return;
    }
    if (
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : 'CLIENT_ERROR';
      void reply.status(error.statusCode).send({ error: error.message, code });
      return;
    }
    request.log.error({ err: error }, 'Необработанная ошибка');
    if (opts.recordError) {
      const actorType = request.trainerId ? 'trainer' : request.clientAccountId ? 'client' : 'anon';
      const actorId = request.trainerId ?? request.clientAccountId ?? null;
      opts.recordError({
        message: error.message,
        name: error.name ?? null,
        stack: error.stack ?? null,
        path: request.url,
        method: request.method,
        statusCode: 500,
        actorType,
        actorId,
        context: { reqId: String(request.id) },
      });
    }
    void reply.status(500).send({ error: 'Внутренняя ошибка сервера', code: 'INTERNAL' });
  };
}

// Обратносовместимый дефолт (без записи) — на случай прямых импортов.
export const errorHandler = makeErrorHandler();
