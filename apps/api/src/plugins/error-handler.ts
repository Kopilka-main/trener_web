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
  // Нативные fastify-ошибки с клиентским statusCode (400..499) пробрасываем как есть —
  // например over-limit multipart (RequestFileTooLargeError → 413). Серверные (>=500)
  // и неизвестные уходят в общую 500-ветку ниже (без утечки деталей).
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
  void reply.status(500).send({ error: 'Внутренняя ошибка сервера', code: 'INTERNAL' });
}
