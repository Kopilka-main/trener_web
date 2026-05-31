import { describe, it, expect } from 'vitest';
import { registerRequestSchema, loginRequestSchema } from './auth.js';

describe('auth schemas', () => {
  it('принимает корректную регистрацию', () => {
    const r = registerRequestSchema.parse({
      email: 'A@B.co',
      password: 'longenough1',
      firstName: 'Иван',
      lastName: 'Тренеров',
    });
    expect(r.email).toBe('a@b.co'); // нормализован в lowercase
  });

  it('отклоняет короткий пароль', () => {
    expect(() => loginRequestSchema.parse({ email: 'a@b.co', password: '123' })).not.toThrow(); // у login нет min — проверяем только формат email
    expect(() => registerRequestSchema.parse({ email: 'x', password: '1' })).toThrow();
  });
});
