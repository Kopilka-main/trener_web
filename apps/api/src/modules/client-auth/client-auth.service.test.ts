import { describe, it, expect, vi } from 'vitest';
import { makeClientAuthService } from './client-auth.service.js';
import type { FilesRepo, FileRow } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';

function fakeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createAccount: vi.fn((a: Record<string, unknown>) =>
      Promise.resolve({ ...a, avatarFileId: null, createdAt: new Date() }),
    ),
    findAccountByEmail: vi.fn(() => Promise.resolve(null)),
    findAccountById: vi.fn(() => Promise.resolve(null)),
    setAvatar: vi.fn(() => Promise.resolve({ previousFileId: null })),
    findAvatarFileId: vi.fn(() => Promise.resolve(null)),
    createSession: vi.fn(() => Promise.resolve()),
    findSession: vi.fn(() => Promise.resolve(null)),
    deleteSession: vi.fn(() => Promise.resolve()),
    findScopeByAccountId: vi.fn(() => Promise.resolve(null)),
    accountExists: vi.fn(() => Promise.resolve(false)),
    updateAccount: vi.fn((id: string, patch: Record<string, unknown>) =>
      Promise.resolve({
        id,
        email: 'a@b.co',
        firstName: 'И',
        lastName: 'К',
        avatarFileId: null,
        birthDate: null,
        contacts: [],
        bio: null,
        ...patch,
      }),
    ),
    ...overrides,
  } as never;
}

function fileRow(over: Partial<FileRow> = {}): FileRow {
  return {
    id: 'f1',
    trainerId: null,
    clientId: null,
    accountId: 'ca1',
    mime: 'image/jpeg',
    sizeBytes: 10,
    storagePath: 'acct_ca1/_/f1.jpg',
    originalName: null,
    createdAt: new Date(0),
    ...over,
  };
}

function fakeFilesRepo(over: Partial<FilesRepo> = {}): FilesRepo {
  return {
    create: vi.fn(() => Promise.resolve(fileRow())),
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    getForAccount: vi.fn(() => Promise.resolve(null)),
    getById: vi.fn(() => Promise.resolve(null)),
    deleteById: vi.fn(() => Promise.resolve(null)),
    delete: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
}

function fakeStorage(over: Partial<Storage> = {}): Storage {
  return {
    save: vi.fn(() => Promise.resolve({ storagePath: 'acct_ca1/_/f1.jpg', sizeBytes: 10 })),
    openRead: vi.fn(),
    read: vi.fn(() => Promise.resolve(Buffer.from([]))),
    remove: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

const detDeps = { newId: () => 'id', now: () => new Date(0) };

function svcWith(
  repo: ReturnType<typeof fakeRepo>,
  over: { filesRepo?: Partial<FilesRepo>; storage?: Partial<Storage> } = {},
) {
  return makeClientAuthService(
    repo,
    fakeFilesRepo(over.filesRepo),
    fakeStorage(over.storage),
    detDeps,
  );
}

describe('client-auth.service', () => {
  it('register отклоняет дубликат email (409)', async () => {
    const repo = fakeRepo({ findAccountByEmail: vi.fn(() => Promise.resolve({ id: 'ca0' })) });
    const svc = svcWith(repo);
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
    const svc = svcWith(repo);
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
    const svc = svcWith(repo);
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
    const svc = svcWith(repo);
    const res = await svc.me('ca1');
    expect(res.link).toEqual({ trainerId: 't1', clientId: 'cl1' });
  });

  it('updateMe передаёт только определённые поля и возвращает профиль', async () => {
    const updateAccount = vi.fn((id: string, patch: Record<string, unknown>) =>
      Promise.resolve({
        id,
        email: 'a@b.co',
        firstName: 'И',
        lastName: 'К',
        avatarFileId: null,
        birthDate: null,
        contacts: [],
        bio: null,
        ...patch,
      }),
    );
    const repo = fakeRepo({ updateAccount });
    const svc = svcWith(repo);
    const res = await svc.updateMe('ca1', { firstName: 'Новое', bio: 'цель' });
    expect(updateAccount).toHaveBeenCalledWith('ca1', { firstName: 'Новое', bio: 'цель' });
    expect(res.firstName).toBe('Новое');
    expect(res.bio).toBe('цель');
  });

  it('updateMe пробрасывает sessionReminderEnabled в patch', async () => {
    const updateAccount = vi.fn((id: string, patch: Record<string, unknown>) =>
      Promise.resolve({
        id,
        email: 'a@b.co',
        firstName: 'И',
        lastName: 'К',
        avatarFileId: null,
        birthDate: null,
        contacts: [],
        bio: null,
        sessionReminderEnabled: true,
        ...patch,
      }),
    );
    const svc = svcWith(fakeRepo({ updateAccount }));
    const res = await svc.updateMe('ca1', { sessionReminderEnabled: false });
    expect(updateAccount).toHaveBeenCalledWith('ca1', { sessionReminderEnabled: false });
    expect(res.sessionReminderEnabled).toBe(false);
  });

  it('me отдаёт sessionReminderEnabled=true по умолчанию (поле есть в профиле)', async () => {
    const repo = fakeRepo({
      findAccountById: vi.fn(() =>
        Promise.resolve({
          id: 'ca1',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: null,
          birthDate: null,
          contacts: [],
          bio: null,
          sessionReminderEnabled: true,
        }),
      ),
    });
    const svc = svcWith(repo);
    const res = await svc.me('ca1');
    expect(res.account.sessionReminderEnabled).toBe(true);
  });

  it('setAvatar сохраняет файл аккаунта (accountId, без trainerId/clientId)', async () => {
    const save = vi.fn(() => Promise.resolve({ storagePath: 'acct_ca1/_/id.jpg', sizeBytes: 10 }));
    const create = vi.fn(() => Promise.resolve(fileRow({ id: 'id' })));
    const setAvatar = vi.fn(() => Promise.resolve({ previousFileId: null }));
    const repo = fakeRepo({
      setAvatar,
      findAccountById: vi.fn(() =>
        Promise.resolve({
          id: 'ca1',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: 'id',
          birthDate: null,
          contacts: [],
          bio: null,
        }),
      ),
    });
    const svc = svcWith(repo, { filesRepo: { create }, storage: { save } });
    const res = await svc.setAvatar('ca1', {
      fileBuffer: Buffer.from('x'),
      mime: 'image/jpeg',
      originalName: null,
    });
    expect(save).toHaveBeenCalledWith('acct_ca1', null, 'id', 'jpg', expect.any(Buffer));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id', accountId: 'ca1', trainerId: null, clientId: null }),
    );
    expect(setAvatar).toHaveBeenCalledWith('ca1', 'id');
    expect(res.avatarFileId).toBe('id');
  });

  it('setAvatar отклоняет неподдерживаемый mime', async () => {
    const svc = svcWith(fakeRepo());
    await expect(
      svc.setAvatar('ca1', { fileBuffer: Buffer.from('x'), mime: 'image/gif', originalName: null }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('setAvatar удаляет старый файл-аватар best-effort через deleteById', async () => {
    const setAvatar = vi.fn(() => Promise.resolve({ previousFileId: 'old' }));
    const deleteById = vi.fn(() =>
      Promise.resolve(fileRow({ id: 'old', storagePath: 'acct_ca1/_/old.jpg' })),
    );
    const remove = vi.fn(() => Promise.resolve());
    const repo = fakeRepo({
      setAvatar,
      findAccountById: vi.fn(() =>
        Promise.resolve({
          id: 'ca1',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: 'id',
          birthDate: null,
          contacts: [],
          bio: null,
        }),
      ),
    });
    const svc = svcWith(repo, { filesRepo: { deleteById }, storage: { remove } });
    await svc.setAvatar('ca1', {
      fileBuffer: Buffer.from('x'),
      mime: 'image/jpeg',
      originalName: null,
    });
    expect(deleteById).toHaveBeenCalledWith('old');
    expect(remove).toHaveBeenCalledWith('acct_ca1/_/old.jpg');
  });

  it('removeAvatar снимает аватар и чистит старый файл', async () => {
    const setAvatar = vi.fn(() => Promise.resolve({ previousFileId: 'old' }));
    const deleteById = vi.fn(() =>
      Promise.resolve(fileRow({ id: 'old', storagePath: 'acct_ca1/_/old.jpg' })),
    );
    const remove = vi.fn(() => Promise.resolve());
    const repo = fakeRepo({ setAvatar });
    const svc = svcWith(repo, { filesRepo: { deleteById }, storage: { remove } });
    await svc.removeAvatar('ca1');
    expect(setAvatar).toHaveBeenCalledWith('ca1', null);
    expect(deleteById).toHaveBeenCalledWith('old');
    expect(remove).toHaveBeenCalledWith('acct_ca1/_/old.jpg');
  });

  it('removeAvatar бросает 401, если аккаунт не найден', async () => {
    const svc = svcWith(fakeRepo({ setAvatar: vi.fn(() => Promise.resolve(null)) }));
    await expect(svc.removeAvatar('ghost')).rejects.toMatchObject({ status: 401 });
  });
});
