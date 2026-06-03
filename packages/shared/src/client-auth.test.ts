import { describe, it, expect } from 'vitest';
import { clientRegisterRequestSchema } from './client-auth.js';

describe('clientRegisterRequestSchema', () => {
  it('нормализует email (trim + lowercase)', () => {
    const parsed = clientRegisterRequestSchema.parse({
      email: '  USER@MAIL.RU ',
      password: 'longenough1',
      firstName: 'Иван',
      lastName: 'Петров',
    });
    expect(parsed.email).toBe('user@mail.ru');
  });

  it('отклоняет короткий пароль', () => {
    expect(() =>
      clientRegisterRequestSchema.parse({
        email: 'u@m.ru',
        password: 'short',
        firstName: 'И',
        lastName: 'П',
      }),
    ).toThrow();
  });
});
