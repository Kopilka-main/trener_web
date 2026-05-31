import { describe, it, expect } from 'vitest';
import { healthResponseSchema } from '@trener/shared';
import { buildApp } from '../../app.js';

describe('GET /api/health', () => {
  it('возвращает корректный по контракту ответ', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    // Ответ должен соответствовать общему контракту из @trener/shared.
    expect(() => healthResponseSchema.parse(res.json())).not.toThrow();
    await app.close();
  });
});
