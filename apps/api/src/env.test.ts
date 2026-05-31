import { describe, it, expect } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('парсит корректное окружение', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      PORT: '3001',
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      COOKIE_SECRET: 'x'.repeat(32),
    });
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('test');
  });

  it('падает при коротком COOKIE_SECRET', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'test',
        PORT: '3001',
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
        COOKIE_SECRET: 'short',
      }),
    ).toThrow();
  });
});
