import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('верифицирует правильный пароль', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(hash).not.toBe('s3cret-pass');
    expect(await verifyPassword(hash, 's3cret-pass')).toBe(true);
  });

  it('отвергает неправильный пароль', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});
