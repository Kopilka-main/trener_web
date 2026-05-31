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
});
