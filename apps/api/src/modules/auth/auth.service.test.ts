import { describe, it, expect, vi } from 'vitest';
import { makeAuthService } from './auth.service.js';
import type { FilesRepo, FileRow } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';

function fakeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createTrainer: vi.fn((t: Record<string, unknown>) =>
      Promise.resolve({ ...t, title: null, bio: null, createdAt: new Date() }),
    ),
    findTrainerByEmail: vi.fn(() => Promise.resolve(null)),
    findTrainerById: vi.fn(() => Promise.resolve(null)),
    setAvatar: vi.fn(() => Promise.resolve({ previousFileId: null })),
    findAvatarFileId: vi.fn(() => Promise.resolve(null)),
    createSession: vi.fn(() => Promise.resolve()),
    findSession: vi.fn(() => Promise.resolve(null)),
    deleteSession: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as never;
}

function fileRow(over: Partial<FileRow> = {}): FileRow {
  return {
    id: 'f1',
    trainerId: 'A',
    clientId: null,
    accountId: null,
    mime: 'image/jpeg',
    sizeBytes: 10,
    storagePath: 'A/_/f1.jpg',
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
    save: vi.fn(() => Promise.resolve({ storagePath: 'A/_/f1.jpg', sizeBytes: 10 })),
    openRead: vi.fn(),
    remove: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

const detDeps = { newId: () => 'id', now: () => new Date(0) };

describe('auth.service', () => {
  it('register отклоняет дубликат email', async () => {
    const repo = fakeRepo({ findTrainerByEmail: vi.fn(() => Promise.resolve({ id: 't0' })) });
    const svc = makeAuthService(repo, fakeFilesRepo(), fakeStorage(), detDeps);
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
    const svc = makeAuthService(repo, fakeFilesRepo(), fakeStorage(), detDeps);
    await expect(svc.login({ email: 'a@b.co', password: 'bad' })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('setAvatar сохраняет файл, создаёт files-строку (trainerId, без clientId/accountId)', async () => {
    const save = vi.fn(() => Promise.resolve({ storagePath: 'A/_/id.jpg', sizeBytes: 10 }));
    const create = vi.fn(() => Promise.resolve(fileRow({ id: 'id' })));
    const setAvatar = vi.fn(() => Promise.resolve({ previousFileId: null }));
    const findTrainerById = vi.fn(() =>
      Promise.resolve({
        id: 'A',
        email: 'a@b.co',
        firstName: 'И',
        lastName: 'Т',
        title: null,
        bio: null,
        contacts: [],
        avatarFileId: 'id',
      }),
    );
    const repo = fakeRepo({ setAvatar, findTrainerById });
    const svc = makeAuthService(repo, fakeFilesRepo({ create }), fakeStorage({ save }), detDeps);
    const res = await svc.setAvatar('A', {
      fileBuffer: Buffer.from('x'),
      mime: 'image/jpeg',
      originalName: null,
    });
    expect(save).toHaveBeenCalledWith('A', null, 'id', 'jpg', expect.any(Buffer));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id', trainerId: 'A', clientId: null, accountId: null }),
    );
    expect(setAvatar).toHaveBeenCalledWith('A', 'id');
    expect(res.avatarFileId).toBe('id');
  });

  it('setAvatar отклоняет неподдерживаемый mime', async () => {
    const svc = makeAuthService(fakeRepo(), fakeFilesRepo(), fakeStorage(), detDeps);
    await expect(
      svc.setAvatar('A', { fileBuffer: Buffer.from('x'), mime: 'image/gif', originalName: null }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('setAvatar удаляет старый файл-аватар best-effort', async () => {
    const setAvatar = vi.fn(() => Promise.resolve({ previousFileId: 'old' }));
    const findTrainerById = vi.fn(() =>
      Promise.resolve({
        id: 'A',
        email: 'a@b.co',
        firstName: 'И',
        lastName: 'Т',
        title: null,
        bio: null,
        contacts: [],
        avatarFileId: 'id',
      }),
    );
    const del = vi.fn(() => Promise.resolve(fileRow({ id: 'old', storagePath: 'A/_/old.jpg' })));
    const remove = vi.fn(() => Promise.resolve());
    const repo = fakeRepo({ setAvatar, findTrainerById });
    const svc = makeAuthService(
      repo,
      fakeFilesRepo({ delete: del }),
      fakeStorage({ remove }),
      detDeps,
    );
    await svc.setAvatar('A', {
      fileBuffer: Buffer.from('x'),
      mime: 'image/jpeg',
      originalName: null,
    });
    expect(del).toHaveBeenCalledWith('A', 'old');
    expect(remove).toHaveBeenCalledWith('A/_/old.jpg');
  });

  it('removeAvatar снимает аватар и чистит старый файл', async () => {
    const setAvatar = vi.fn(() => Promise.resolve({ previousFileId: 'old' }));
    const del = vi.fn(() => Promise.resolve(fileRow({ id: 'old', storagePath: 'A/_/old.jpg' })));
    const remove = vi.fn(() => Promise.resolve());
    const repo = fakeRepo({ setAvatar });
    const svc = makeAuthService(
      repo,
      fakeFilesRepo({ delete: del }),
      fakeStorage({ remove }),
      detDeps,
    );
    await svc.removeAvatar('A');
    expect(setAvatar).toHaveBeenCalledWith('A', null);
    expect(del).toHaveBeenCalledWith('A', 'old');
    expect(remove).toHaveBeenCalledWith('A/_/old.jpg');
  });

  it('removeAvatar бросает 401, если тренер не найден', async () => {
    const svc = makeAuthService(
      fakeRepo({ setAvatar: vi.fn(() => Promise.resolve(null)) }),
      fakeFilesRepo(),
      fakeStorage(),
      detDeps,
    );
    await expect(svc.removeAvatar('ghost')).rejects.toMatchObject({ status: 401 });
  });
});
