import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { tenantContext, requireAuth } from './tenant-context.js';

function build(
  findSession: (id: string) => Promise<{ trainerId: string; expiresAt: Date } | null>,
) {
  const app = Fastify();
  void app.register(cookie, { secret: 'x'.repeat(40) });
  void app.register(tenantContext, { findSession, now: () => new Date(0) });
  app.get('/who', { preHandler: requireAuth }, (req) => ({ trainerId: req.trainerId }));
  return app;
}

describe('tenant-context + requireAuth', () => {
  it('401 без cookie', async () => {
    const app = build(() => Promise.resolve(null));
    const res = await app.inject({ method: 'GET', url: '/who' });
    expect(res.statusCode).toBe(401);
  });

  it('пропускает с валидной сессией и кладёт trainerId', async () => {
    const app = build((id) =>
      Promise.resolve(id === 'good' ? { trainerId: 't1', expiresAt: new Date(1000) } : null),
    );
    const res = await app.inject({ method: 'GET', url: '/who', cookies: { sid: 'good' } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ trainerId: string }>().trainerId).toBe('t1');
  });

  it('401 при просроченной сессии', async () => {
    const app = build(() => Promise.resolve({ trainerId: 't1', expiresAt: new Date(-1) }));
    const res = await app.inject({ method: 'GET', url: '/who', cookies: { sid: 'any' } });
    expect(res.statusCode).toBe(401);
  });
});
