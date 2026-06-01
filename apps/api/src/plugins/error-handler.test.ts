import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { errorHandler } from './error-handler.js';
import { notFound } from '../errors.js';

describe('errorHandler', () => {
  it('маппит AppError в его status и code', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/boom', () => {
      throw notFound('нет клиента');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'нет клиента', code: 'NOT_FOUND' });
  });

  it('непредвиденную ошибку отдаёт как 500 без деталей', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/crash', () => {
      throw new Error('секретные детали');
    });
    const res = await app.inject({ method: 'GET', url: '/crash' });
    expect(res.statusCode).toBe(500);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('Внутренняя ошибка сервера');
    expect(JSON.stringify(body)).not.toContain('секретные детали');
  });

  it('пробрасывает statusCode fastify-ошибки (413) с её code', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/big', () => {
      const err = Object.assign(new Error('Файл слишком большой'), {
        statusCode: 413,
        code: 'FST_REQ_FILE_TOO_LARGE',
      });
      throw err;
    });
    const res = await app.inject({ method: 'GET', url: '/big' });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({
      error: 'Файл слишком большой',
      code: 'FST_REQ_FILE_TOO_LARGE',
    });
  });

  it('серверную fastify-ошибку (>=500) скрывает за общей 500', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/srv', () => {
      throw Object.assign(new Error('секрет'), { statusCode: 503, code: 'FST_X' });
    });
    const res = await app.inject({ method: 'GET', url: '/srv' });
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.json())).not.toContain('секрет');
  });

  it('маппит ошибку валидации схемы запроса в 400', async () => {
    const { z } = await import('zod');
    const { serializerCompiler, validatorCompiler } = await import('fastify-type-provider-zod');
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.setErrorHandler(errorHandler);
    app.post('/v', { schema: { body: z.object({ n: z.number() }) } }, () => ({ ok: true }));
    const res = await app.inject({ method: 'POST', url: '/v', payload: { n: 'no' } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
  });
});
