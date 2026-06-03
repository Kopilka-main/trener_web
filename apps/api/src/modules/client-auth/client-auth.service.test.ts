import { describe, it, expect, vi } from 'vitest';
import { makeClientAuthService } from './client-auth.service.js';

function fakeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createAccount: vi.fn((a: Record<string, unknown>) =>
      Promise.resolve({ ...a, avatarFileId: null, createdAt: new Date() }),
    ),
    findAccountByEmail: vi.fn(() => Promise.resolve(null)),
    findAccountById: vi.fn(() => Promise.resolve(null)),
    createSession: vi.fn(() => Promise.resolve()),
    findSession: vi.fn(() => Promise.resolve(null)),
    deleteSession: vi.fn(() => Promise.resolve()),
    findScopeByAccountId: vi.fn(() => Promise.resolve(null)),
    accountExists: vi.fn(() => Promise.resolve(false)),
    ...overrides,
  } as never;
}

describe('client-auth.service', () => {
  it('register отклоняет дубликат email (409)', async () => {
    const repo = fakeRepo({ findAccountByEmail: vi.fn(() => Promise.resolve({ id: 'ca0' })) });
    const svc = makeClientAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    await expect(
      svc.register({ email: 'a@b.co', password: 'longenough1', firstName: 'И', lastName: 'К' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('login отклоняет неверный пароль (401)', async () => {
    const repo = fakeRepo({
      findAccountByEmail: vi.fn(() =>
        Promise.resolve({
          id: 'ca1',
          passwordHash: 'h',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: null,
        }),
      ),
    });
    const svc = makeClientAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    await expect(svc.login({ email: 'a@b.co', password: 'bad' })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('me возвращает link=null для непривязанного аккаунта', async () => {
    const repo = fakeRepo({
      findAccountById: vi.fn(() =>
        Promise.resolve({
          id: 'ca1',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: null,
        }),
      ),
      findScopeByAccountId: vi.fn(() => Promise.resolve(null)),
    });
    const svc = makeClientAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    const res = await svc.me('ca1');
    expect(res.link).toBeNull();
    expect(res.account.id).toBe('ca1');
  });

  it('me возвращает link со скоупом для привязанного аккаунта', async () => {
    const repo = fakeRepo({
      findAccountById: vi.fn(() =>
        Promise.resolve({
          id: 'ca1',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: null,
        }),
      ),
      findScopeByAccountId: vi.fn(() => Promise.resolve({ trainerId: 't1', clientId: 'cl1' })),
    });
    const svc = makeClientAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    const res = await svc.me('ca1');
    expect(res.link).toEqual({ trainerId: 't1', clientId: 'cl1' });
  });
});
