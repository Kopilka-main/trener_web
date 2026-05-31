import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { makeRequireClientAccess } from './require-client-access.js';

function build(isLinked: (t: string, c: string) => Promise<boolean>) {
  const app = Fastify();
  // эмулируем tenant-context: проставляем trainerId до guard
  app.addHook('onRequest', (req, _r, done) => {
    req.trainerId = 'A';
    done();
  });
  const guard = makeRequireClientAccess({ isLinked });
  app.get('/clients/:id', { preHandler: guard }, () => ({ ok: true }));
  return app;
}

describe('requireClientAccess', () => {
  it('404 если связь не найдена', async () => {
    const app = build(() => Promise.resolve(false));
    const res = await app.inject({ method: 'GET', url: '/clients/x' });
    expect(res.statusCode).toBe(404);
  });

  it('пропускает если связь есть', async () => {
    const app = build(() => Promise.resolve(true));
    const res = await app.inject({ method: 'GET', url: '/clients/x' });
    expect(res.statusCode).toBe(200);
  });
});
