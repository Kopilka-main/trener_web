import { describe, it, expect } from 'vitest';
import { appInfoResponseSchema } from '@trener/shared';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

describe('GET /api/app-info', () => {
  it('возвращает корректный по контракту ответ без авторизации', async () => {
    const { db } = createDb('postgres://u:p@localhost:5432/none');
    const app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    const res = await app.inject({ method: 'GET', url: '/api/app-info' });
    expect(res.statusCode).toBe(200);
    const body = appInfoResponseSchema.parse(res.json());
    expect(body.trainer.android).toContain('trener_trainer');
    expect(body.client.android).toContain('trener_client');
    await app.close();
  });

  it('minBuild по умолчанию 0 (обновление не требуется)', async () => {
    const { db } = createDb('postgres://u:p@localhost:5432/none');
    const app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    const res = await app.inject({ method: 'GET', url: '/api/app-info' });
    const body = appInfoResponseSchema.parse(res.json());
    expect(body.trainer.minBuild).toBe(0);
    expect(body.client.minBuild).toBe(0);
    await app.close();
  });
});
