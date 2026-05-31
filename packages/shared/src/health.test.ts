import { describe, it, expect } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('принимает корректный ответ health', () => {
    const parsed = healthResponseSchema.parse({ ok: true, ts: '2026-05-31T00:00:00.000Z' });
    expect(parsed.ok).toBe(true);
  });

  it('отклоняет ответ без ts', () => {
    expect(() => healthResponseSchema.parse({ ok: true })).toThrow();
  });
});
