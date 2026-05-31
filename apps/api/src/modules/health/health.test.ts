import { describe, it, expect } from 'vitest';
import { healthResponseSchema } from '@trener/shared';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

describe('GET /api/health', () => {
  it('возвращает корректный по контракту ответ', async () => {
    const { db } = createDb('postgres://u:p@localhost:5432/none');
    const app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    // Ответ должен соответствовать общему контракту из @trener/shared.
    expect(() => healthResponseSchema.parse(res.json())).not.toThrow();
    await app.close();
  });
});
