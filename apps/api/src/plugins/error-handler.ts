import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../errors.js';

export function errorHandler(
  error: FastifyError | AppError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (hasZodFastifySchemaValidationErrors(error)) {
    void reply.status(400).send({
      error: 'Ошибка валидации',
      code: 'VALIDATION_ERROR',
      details: error.validation,
    });
    return;
  }
  if (error instanceof AppError) {
    void reply.status(error.status).send({
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }
  if (error instanceof ZodError) {
    void reply.status(400).send({
      error: 'Ошибка валидации',
      code: 'VALIDATION_ERROR',
      details: error.flatten(),
    });
    return;
  }
  request.log.error({ err: error }, 'Необработанная ошибка');
  void reply.status(500).send({ error: 'Внутренняя ошибка сервера', code: 'INTERNAL' });
}
