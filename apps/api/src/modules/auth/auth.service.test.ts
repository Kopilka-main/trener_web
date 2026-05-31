import { describe, it, expect, vi } from 'vitest';
import { makeAuthService } from './auth.service.js';

function fakeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createTrainer: vi.fn((t: Record<string, unknown>) =>
      Promise.resolve({ ...t, title: null, bio: null, createdAt: new Date() }),
    ),
    findTrainerByEmail: vi.fn(() => Promise.resolve(null)),
    findTrainerById: vi.fn(() => Promise.resolve(null)),
    createSession: vi.fn(() => Promise.resolve()),
    findSession: vi.fn(() => Promise.resolve(null)),
    deleteSession: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as never;
}

describe('auth.service', () => {
  it('register отклоняет дубликат email', async () => {
    const repo = fakeRepo({ findTrainerByEmail: vi.fn(() => Promise.resolve({ id: 't0' })) });
    const svc = makeAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    await expect(
      svc.register({ email: 'a@b.co', password: 'longenough1', firstName: 'И', lastName: 'Т' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('login отклоняет неверный пароль', async () => {
    const repo = fakeRepo({
      findTrainerByEmail: vi.fn(() =>
        Promise.resolve({
          id: 't1',
          passwordHash: 'h',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'Т',
          title: null,
          bio: null,
        }),
      ),
    });
    const svc = makeAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    await expect(svc.login({ email: 'a@b.co', password: 'bad' })).rejects.toMatchObject({
      status: 401,
    });
  });
});
