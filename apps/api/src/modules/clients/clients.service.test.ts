import { describe, it, expect, vi } from 'vitest';
import type { ClientsRepo, ClientRow } from './clients.repo.js';
import type { FilesRepo, FileRow } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';
import { makeClientsService } from './clients.service.js';

function row(over: Partial<ClientRow> = {}): ClientRow {
  return {
    id: 'c1',
    firstName: 'Кли',
    lastName: 'Ент',
    phone: null,
    accountId: null,
    birthDate: null,
    notes: null,
    status: 'active',
    contacts: [],
    tags: [],
    avatarFileId: null,
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<ClientsRepo> = {}): ClientsRepo {
  return {
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    isLinked: vi.fn(() => Promise.resolve(false)),
    create: vi.fn(() => Promise.resolve(row())),
    listByTrainer: vi.fn(() => Promise.resolve([])),
    update: vi.fn(() => Promise.resolve(null)),
    setAvatar: vi.fn(() => Promise.resolve(undefined)),
    unlink: vi.fn(() => Promise.resolve(false)),
    ...over,
  };
}

function fileRow(over: Partial<FileRow> = {}): FileRow {
  return {
    id: 'f1',
    trainerId: 'A',
    clientId: 'c1',
    mime: 'image/jpeg',
    sizeBytes: 10,
    storagePath: 'A/c1/f1.jpg',
    originalName: null,
    createdAt: new Date(0),
    ...over,
  };
}

function fakeFilesRepo(over: Partial<FilesRepo> = {}): FilesRepo {
  return {
    create: vi.fn(() => Promise.resolve(fileRow())),
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    delete: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
}

function fakeStorage(over: Partial<Storage> = {}): Storage {
  return {
    save: vi.fn(() => Promise.resolve({ storagePath: 'A/c1/f1.jpg', sizeBytes: 10 })),
    openRead: vi.fn(),
    remove: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

const deps = { newId: () => 'newid' };

function makeSvc(
  over: {
    repo?: Partial<ClientsRepo>;
    filesRepo?: Partial<FilesRepo>;
    storage?: Partial<Storage>;
  } = {},
) {
  return makeClientsService(
    fakeRepo(over.repo),
    fakeFilesRepo(over.filesRepo),
    fakeStorage(over.storage),
    deps,
  );
}

describe('clients.service', () => {
  it('create генерирует id и зовёт repo.create со scope тренера', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSvc({ repo: { create } });
    const res = await svc.create('A', {
      firstName: 'Кли',
      lastName: 'Ент',
      phone: null,
      notes: null,
      contacts: [],
      tags: [],
    });
    expect(res.id).toBe('c1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'newid', trainerId: 'A', firstName: 'Кли' }),
    );
  });

  it('create пробрасывает contacts и tags в repo и в ответ', async () => {
    const contacts = [{ type: 'Телефон', value: '+7900' }];
    const tags = ['vip'];
    const create = vi.fn(() => Promise.resolve(row({ contacts, tags })));
    const svc = makeSvc({ repo: { create } });
    const res = await svc.create('A', {
      firstName: 'Кли',
      lastName: 'Ент',
      phone: null,
      notes: null,
      contacts,
      tags,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ contacts, tags }));
    expect(res.contacts).toEqual(contacts);
    expect(res.tags).toEqual(tags);
  });

  it('create по умолчанию шлёт пустые contacts и tags', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSvc({ repo: { create } });
    await svc.create('A', {
      firstName: 'Кли',
      lastName: 'Ент',
      phone: null,
      notes: null,
      contacts: [],
      tags: [],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ contacts: [], tags: [] }));
  });

  it('create пробрасывает accountId в repo и в ответ', async () => {
    const create = vi.fn(() => Promise.resolve(row({ accountId: 'acc-123' })));
    const svc = makeSvc({ repo: { create } });
    const res = await svc.create('A', {
      firstName: 'Кли',
      lastName: 'Ент',
      phone: null,
      notes: null,
      accountId: 'acc-123',
      contacts: [],
      tags: [],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-123' }));
    expect(res.accountId).toBe('acc-123');
  });

  it('create по умолчанию шлёт accountId null', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSvc({ repo: { create } });
    const res = await svc.create('A', {
      firstName: 'Кли',
      lastName: 'Ент',
      phone: null,
      notes: null,
      contacts: [],
      tags: [],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ accountId: null }));
    expect(res.accountId).toBeNull();
  });

  it('create пробрасывает birthDate в repo и в ответ', async () => {
    const create = vi.fn(() => Promise.resolve(row({ birthDate: '1990-05-20' })));
    const svc = makeSvc({ repo: { create } });
    const res = await svc.create('A', {
      firstName: 'Кли',
      lastName: 'Ент',
      phone: null,
      notes: null,
      birthDate: '1990-05-20',
      contacts: [],
      tags: [],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ birthDate: '1990-05-20' }));
    expect(res.birthDate).toBe('1990-05-20');
  });

  it('create по умолчанию шлёт birthDate null', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSvc({ repo: { create } });
    const res = await svc.create('A', {
      firstName: 'Кли',
      lastName: 'Ент',
      phone: null,
      notes: null,
      contacts: [],
      tags: [],
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ birthDate: null }));
    expect(res.birthDate).toBeNull();
  });

  it('get бросает 404, если repo вернул null', async () => {
    const svc = makeSvc();
    await expect(svc.get('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('update бросает 404, если repo вернул null', async () => {
    const svc = makeSvc();
    await expect(svc.update('A', 'missing', { notes: 'n' })).rejects.toMatchObject({ status: 404 });
  });

  it('unlink бросает 404, если связи не было', async () => {
    const svc = makeSvc({ repo: { unlink: vi.fn(() => Promise.resolve(false)) } });
    await expect(svc.unlink('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('setAvatar сохраняет файл, создаёт files-строку и проставляет avatarFileId', async () => {
    const save = vi.fn(() => Promise.resolve({ storagePath: 'A/c1/newid.jpg', sizeBytes: 10 }));
    const create = vi.fn(() => Promise.resolve(fileRow({ id: 'newid' })));
    const setAvatar = vi.fn(() => Promise.resolve({ previousFileId: null }));
    const getForTrainer = vi.fn(() => Promise.resolve(row({ avatarFileId: 'newid' })));
    const svc = makeSvc({
      repo: { setAvatar, getForTrainer },
      filesRepo: { create },
      storage: { save },
    });
    const res = await svc.setAvatar('A', 'c1', {
      fileBuffer: Buffer.from('x'),
      mime: 'image/jpeg',
      originalName: null,
    });
    expect(save).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'newid', trainerId: 'A', clientId: 'c1', mime: 'image/jpeg' }),
    );
    expect(setAvatar).toHaveBeenCalledWith('A', 'c1', 'newid');
    expect(res.avatarFileId).toBe('newid');
  });

  it('setAvatar отклоняет неподдерживаемый mime', async () => {
    const svc = makeSvc();
    await expect(
      svc.setAvatar('A', 'c1', {
        fileBuffer: Buffer.from('x'),
        mime: 'image/gif',
        originalName: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('setAvatar удаляет старый файл-аватар best-effort', async () => {
    const setAvatar = vi.fn(() => Promise.resolve({ previousFileId: 'old' }));
    const getForTrainer = vi.fn(() => Promise.resolve(row({ avatarFileId: 'newid' })));
    const del = vi.fn(() => Promise.resolve(fileRow({ id: 'old', storagePath: 'A/c1/old.jpg' })));
    const remove = vi.fn(() => Promise.resolve());
    const svc = makeSvc({
      repo: { setAvatar, getForTrainer },
      filesRepo: { delete: del },
      storage: { remove },
    });
    await svc.setAvatar('A', 'c1', {
      fileBuffer: Buffer.from('x'),
      mime: 'image/jpeg',
      originalName: null,
    });
    expect(del).toHaveBeenCalledWith('A', 'old');
    expect(remove).toHaveBeenCalledWith('A/c1/old.jpg');
  });

  it('removeAvatar снимает аватар и чистит старый файл', async () => {
    const setAvatar = vi.fn(() => Promise.resolve({ previousFileId: 'old' }));
    const del = vi.fn(() => Promise.resolve(fileRow({ id: 'old', storagePath: 'A/c1/old.jpg' })));
    const remove = vi.fn(() => Promise.resolve());
    const svc = makeSvc({
      repo: { setAvatar },
      filesRepo: { delete: del },
      storage: { remove },
    });
    await svc.removeAvatar('A', 'c1');
    expect(setAvatar).toHaveBeenCalledWith('A', 'c1', null);
    expect(del).toHaveBeenCalledWith('A', 'old');
    expect(remove).toHaveBeenCalledWith('A/c1/old.jpg');
  });

  it('removeAvatar бросает 404, если связи нет', async () => {
    const svc = makeSvc({ repo: { setAvatar: vi.fn(() => Promise.resolve(undefined)) } });
    await expect(svc.removeAvatar('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });
});
