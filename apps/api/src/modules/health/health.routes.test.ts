import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { healthRoutes } from './health.routes.js';

function app(ping?: () => Promise<void>) {
  const a = Fastify();
  a.setValidatorCompiler(validatorCompiler);
  a.setSerializerCompiler(serializerCompiler);
  healthRoutes(a, ping);
  return a;
}

describe('health routes', () => {
  it('liveness отвечает 200 даже без БД (процесс жив)', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('readiness отвечает 200, когда БД отвечает', async () => {
    const res = await app(() => Promise.resolve()).inject({
      method: 'GET',
      url: '/api/health/ready',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('readiness отвечает 503, когда БД недоступна', async () => {
    const res = await app(() => Promise.reject(new Error('connection refused'))).inject({
      method: 'GET',
      url: '/api/health/ready',
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false });
  });

  it('readiness без пинга ведёт себя как liveness (в тестах БД не подключают)', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/health/ready' });
    expect(res.statusCode).toBe(200);
  });
});
