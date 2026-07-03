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
    findByAccountId: vi.fn(() => Promise.resolve(null)),
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
    accountId: null,
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
    getForAccount: vi.fn(() => Promise.resolve(null)),
    getById: vi.fn(() => Promise.resolve(null)),
    deleteById: vi.fn(() => Promise.resolve(null)),
    delete: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
}

function fakeStorage(over: Partial<Storage> = {}): Storage {
  return {
    save: vi.fn(() => Promise.resolve({ storagePath: 'A/c1/f1.jpg', sizeBytes: 10 })),
    openRead: vi.fn(),
    read: vi.fn(() => Promise.resolve(Buffer.from([]))),
    remove: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

type AccountProfileFn = (id: string) => Promise<{
  firstName: string;
  lastName: string;
  birthDate: string | null;
  contacts: { type: string; value: string }[];
} | null>;

const defaultAccountProfile: AccountProfileFn = () => Promise.resolve(null);

type NotifyLinkedFn = (
  trainerId: string,
  clientId: string,
  firstName: string,
  lastName: string,
) => void;

function makeDeps(
  accountExists: (id: string) => Promise<boolean> = vi.fn(() => Promise.resolve(true)),
  accountProfile: AccountProfileFn = defaultAccountProfile,
  accountAvatarFileId: (id: string) => Promise<string | null> = () => Promise.resolve(null),
  notifyLinked?: NotifyLinkedFn,
) {
  return {
    newId: () => 'newid',
    accountExists,
    accountProfile,
    accountAvatarFileId,
    ...(notifyLinked ? { notifyLinked } : {}),
  };
}
const deps = makeDeps();

function makeSvc(
  over: {
    repo?: Partial<ClientsRepo>;
    filesRepo?: Partial<FilesRepo>;
    storage?: Partial<Storage>;
    accountExists?: (id: string) => Promise<boolean>;
    accountProfile?: AccountProfileFn;
    accountAvatarFileId?: (id: string) => Promise<string | null>;
    notifyLinked?: NotifyLinkedFn;
  } = {},
) {
  const hasDepOverride =
    over.accountExists !== undefined ||
    over.accountProfile !== undefined ||
    over.accountAvatarFileId !== undefined ||
    over.notifyLinked !== undefined;
  return makeClientsService(
    fakeRepo(over.repo),
    fakeFilesRepo(over.filesRepo),
    fakeStorage(over.storage),
    hasDepOverride
      ? makeDeps(
          over.accountExists ?? (() => Promise.resolve(true)),
          over.accountProfile,
          over.accountAvatarFileId ?? (() => Promise.resolve(null)),
          over.notifyLinked,
        )
      : deps,
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

  it('update с несуществующим accountId → 422 CLIENT_ACCOUNT_NOT_FOUND', async () => {
    const accountExists = vi.fn(() => Promise.resolve(false));
    const svc = makeSvc({ accountExists });
    await expect(svc.update('A', 'c1', { accountId: 'ghost' })).rejects.toMatchObject({
      status: 422,
      code: 'CLIENT_ACCOUNT_NOT_FOUND',
    });
    expect(accountExists).toHaveBeenCalledWith('ghost');
  });

  it('update с accountId=null (отвязка) не проверяет существование', async () => {
    const accountExists = vi.fn(() => Promise.resolve(false));
    const update = vi.fn(() => Promise.resolve(row({ accountId: null })));
    const svc = makeSvc({ repo: { update }, accountExists });
    await svc.update('A', 'c1', { accountId: null });
    expect(accountExists).not.toHaveBeenCalled();
  });

  it('checkConnectCode: пустой код → exists=false без обращения к accountExists', async () => {
    const accountExists = vi.fn(() => Promise.resolve(true));
    const svc = makeSvc({ accountExists });
    expect(await svc.checkConnectCode('A', '   ')).toEqual({ exists: false, linkedClient: null });
    expect(accountExists).not.toHaveBeenCalled();
  });

  it('checkConnectCode: непустой код — exists + привязанный клиент (дубль)', async () => {
    const accountExists = vi.fn(() => Promise.resolve(true));
    const findByAccountId = vi.fn(() =>
      Promise.resolve({ id: 'c2', firstName: 'Иван', lastName: 'Петров' }),
    );
    const svc = makeSvc({ accountExists, repo: { findByAccountId } });
    const res = await svc.checkConnectCode('A', ' code1 ', 'c1');
    expect(res).toEqual({
      exists: true,
      linkedClient: { id: 'c2', firstName: 'Иван', lastName: 'Петров' },
    });
    expect(accountExists).toHaveBeenCalledWith('code1');
    expect(findByAccountId).toHaveBeenCalledWith('A', 'code1', 'c1');
  });

  it('create с уже привязанным accountId → 409 CLIENT_ALREADY_LINKED (с именем)', async () => {
    const findByAccountId = vi.fn(() =>
      Promise.resolve({ id: 'c2', firstName: 'Иван', lastName: 'Петров' }),
    );
    const svc = makeSvc({ repo: { findByAccountId } });
    await expect(
      svc.create('A', {
        firstName: 'Н',
        lastName: '',
        contacts: [],
        tags: [],
        isOnline: false,
        accountId: 'acc-1',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'CLIENT_ALREADY_LINKED' });
  });

  it('getAccountProfile возвращает профиль аккаунта (с тримом id)', async () => {
    const accountProfile = vi.fn(() =>
      Promise.resolve({
        firstName: 'Имя',
        lastName: 'Фам',
        birthDate: '1990-01-01',
        contacts: [{ type: 'Телефон', value: '+7900' }],
      }),
    );
    const svc = makeSvc({ accountProfile });
    const res = await svc.getAccountProfile('  acc-1  ');
    expect(accountProfile).toHaveBeenCalledWith('acc-1');
    expect(res).toEqual({
      firstName: 'Имя',
      lastName: 'Фам',
      birthDate: '1990-01-01',
      contacts: [{ type: 'Телефон', value: '+7900' }],
    });
  });

  it('getAccountProfile бросает 404, если аккаунт не найден', async () => {
    const svc = makeSvc({ accountProfile: () => Promise.resolve(null) });
    await expect(svc.getAccountProfile('ghost')).rejects.toMatchObject({ status: 404 });
  });

  it('create с несуществующим accountId → 422 CLIENT_ACCOUNT_NOT_FOUND', async () => {
    const accountExists = vi.fn(() => Promise.resolve(false));
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSvc({ repo: { create }, accountExists });
    await expect(
      svc.create('A', {
        firstName: 'Кли',
        lastName: 'Ент',
        phone: null,
        notes: null,
        accountId: 'ghost',
        contacts: [],
        tags: [],
      }),
    ).rejects.toMatchObject({ status: 422, code: 'CLIENT_ACCOUNT_NOT_FOUND' });
    expect(accountExists).toHaveBeenCalledWith('ghost');
    expect(create).not.toHaveBeenCalled();
  });

  it('linkPreview: пустой код → exists=false, всё null, без обращений к deps', async () => {
    const accountExists = vi.fn(() => Promise.resolve(true));
    const svc = makeSvc({ accountExists });
    const res = await svc.linkPreview('A', '   ');
    expect(res).toEqual({
      preview: {
        exists: false,
        firstName: null,
        lastName: null,
        hasAvatar: false,
        linkedClientId: null,
        linkedClientName: null,
      },
    });
    expect(accountExists).not.toHaveBeenCalled();
  });

  it('linkPreview: существующий аккаунт с аватаром, ещё не привязан у тренера', async () => {
    const accountExists = vi.fn(() => Promise.resolve(true));
    const accountProfile: AccountProfileFn = () =>
      Promise.resolve({ firstName: 'Имя', lastName: 'Фам', birthDate: null, contacts: [] });
    const accountAvatarFileId = () => Promise.resolve('file-1');
    const findByAccountId = vi.fn(() => Promise.resolve(null));
    const svc = makeSvc({
      accountExists,
      accountProfile,
      accountAvatarFileId,
      repo: { findByAccountId },
    });
    const res = await svc.linkPreview('A', ' code1 ');
    expect(res.preview).toEqual({
      exists: true,
      firstName: 'Имя',
      lastName: 'Фам',
      hasAvatar: true,
      linkedClientId: null,
      linkedClientName: null,
    });
    expect(findByAccountId).toHaveBeenCalledWith('A', 'code1');
  });

  it('linkPreview: аккаунт уже привязан к клиенту тренера → linkedClientId/Name', async () => {
    const svc = makeSvc({
      accountExists: () => Promise.resolve(true),
      accountProfile: () =>
        Promise.resolve({ firstName: 'Имя', lastName: 'Фам', birthDate: null, contacts: [] }),
      repo: {
        findByAccountId: vi.fn(() =>
          Promise.resolve({ id: 'c2', firstName: 'Иван', lastName: 'Петров' }),
        ),
      },
    });
    const res = await svc.linkPreview('A', 'code1');
    expect(res.preview.linkedClientId).toBe('c2');
    expect(res.preview.linkedClientName).toBe('Иван Петров');
  });

  it('accountAvatar: возвращает {mime, storagePath} по avatarFileId аккаунта', async () => {
    const getById = vi.fn(() =>
      Promise.resolve(fileRow({ id: 'file-1', mime: 'image/png', storagePath: 'p/x.png' })),
    );
    const svc = makeSvc({
      accountAvatarFileId: () => Promise.resolve('file-1'),
      filesRepo: { getById },
    });
    expect(await svc.accountAvatar(' acc-1 ')).toEqual({
      mime: 'image/png',
      storagePath: 'p/x.png',
    });
    expect(getById).toHaveBeenCalledWith('file-1');
  });

  it('accountAvatar: нет avatarFileId → null', async () => {
    const svc = makeSvc({ accountAvatarFileId: () => Promise.resolve(null) });
    expect(await svc.accountAvatar('acc-1')).toBeNull();
  });

  it('claim: несуществующий аккаунт → 422 CLIENT_ACCOUNT_NOT_FOUND', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSvc({ accountExists: () => Promise.resolve(false), repo: { create } });
    await expect(svc.claim('A', 'ghost')).rejects.toMatchObject({
      status: 422,
      code: 'CLIENT_ACCOUNT_NOT_FOUND',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('claim: пустой код → 422, без создания', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSvc({ repo: { create } });
    await expect(svc.claim('A', '   ')).rejects.toMatchObject({
      status: 422,
      code: 'CLIENT_ACCOUNT_NOT_FOUND',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('claim: аккаунт уже привязан у тренера → возвращает клиента, alreadyExisted=true', async () => {
    const findByAccountId = vi.fn(() =>
      Promise.resolve({ id: 'c2', firstName: 'Иван', lastName: 'Петров' }),
    );
    const getForTrainer = vi.fn(() => Promise.resolve(row({ id: 'c2', accountId: 'acc-1' })));
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSvc({
      accountExists: () => Promise.resolve(true),
      repo: { findByAccountId, getForTrainer, create },
    });
    const res = await svc.claim('A', 'acc-1');
    expect(res.alreadyExisted).toBe(true);
    expect(res.client.id).toBe('c2');
    expect(getForTrainer).toHaveBeenCalledWith('A', 'c2');
    expect(create).not.toHaveBeenCalled();
  });

  it('claim: новый аккаунт → создаёт клиента из профиля, alreadyExisted=false', async () => {
    const accountProfile: AccountProfileFn = () =>
      Promise.resolve({
        firstName: 'Имя',
        lastName: 'Фам',
        birthDate: '1990-01-01',
        contacts: [{ type: 'Телефон', value: '+7900' }],
      });
    const create = vi.fn(() =>
      Promise.resolve(row({ id: 'c9', accountId: 'acc-1', firstName: 'Имя', lastName: 'Фам' })),
    );
    // avatarFromAccount: клиент есть, но у аккаунта аватара нет (accountAvatarFileId=null) → no-op.
    const getForTrainer = vi.fn(() =>
      Promise.resolve(row({ id: 'c9', accountId: 'acc-1', firstName: 'Имя', lastName: 'Фам' })),
    );
    const svc = makeSvc({
      accountExists: () => Promise.resolve(true),
      accountProfile,
      accountAvatarFileId: () => Promise.resolve(null),
      repo: { findByAccountId: () => Promise.resolve(null), create, getForTrainer },
    });
    const res = await svc.claim('A', ' acc-1 ');
    expect(res.alreadyExisted).toBe(false);
    expect(res.client.id).toBe('c9');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Имя',
        lastName: 'Фам',
        accountId: 'acc-1',
        birthDate: '1990-01-01',
        contacts: [{ type: 'Телефон', value: '+7900' }],
      }),
    );
  });

  it('claim нового клиента → шлёт notifyLinked (подключение) тренеру', async () => {
    const notifyLinked = vi.fn();
    const accountProfile: AccountProfileFn = () =>
      Promise.resolve({ firstName: 'Имя', lastName: 'Фам', birthDate: null, contacts: [] });
    const create = vi.fn(() =>
      Promise.resolve(row({ id: 'c9', accountId: 'acc-1', firstName: 'Имя', lastName: 'Фам' })),
    );
    const getForTrainer = vi.fn(() =>
      Promise.resolve(row({ id: 'c9', accountId: 'acc-1', firstName: 'Имя', lastName: 'Фам' })),
    );
    const svc = makeSvc({
      accountExists: () => Promise.resolve(true),
      accountProfile,
      accountAvatarFileId: () => Promise.resolve(null),
      repo: { findByAccountId: () => Promise.resolve(null), create, getForTrainer },
      notifyLinked,
    });
    await svc.claim('A', 'acc-1');
    expect(notifyLinked).toHaveBeenCalledWith('A', 'c9', 'Имя', 'Фам');
  });

  it('claim уже привязанного (alreadyExisted) → notifyLinked НЕ шлётся', async () => {
    const notifyLinked = vi.fn();
    const findByAccountId = vi.fn(() =>
      Promise.resolve({ id: 'c2', firstName: 'Иван', lastName: 'Петров' }),
    );
    const getForTrainer = vi.fn(() => Promise.resolve(row({ id: 'c2', accountId: 'acc-1' })));
    const svc = makeSvc({
      accountExists: () => Promise.resolve(true),
      repo: { findByAccountId, getForTrainer },
      notifyLinked,
    });
    const res = await svc.claim('A', 'acc-1');
    expect(res.alreadyExisted).toBe(true);
    expect(notifyLinked).not.toHaveBeenCalled();
  });

  it('update: привязка accountId (null→value) → notifyLinked тренеру', async () => {
    const notifyLinked = vi.fn();
    // before: клиент без привязки; после update — с accountId.
    const getForTrainer = vi.fn(() => Promise.resolve(row({ id: 'c1', accountId: null })));
    const update = vi.fn(() =>
      Promise.resolve(row({ id: 'c1', accountId: 'acc-1', firstName: 'Кли', lastName: 'Ент' })),
    );
    const svc = makeSvc({
      accountExists: () => Promise.resolve(true),
      repo: { getForTrainer, update, findByAccountId: () => Promise.resolve(null) },
      notifyLinked,
    });
    await svc.update('A', 'c1', { accountId: 'acc-1' });
    expect(notifyLinked).toHaveBeenCalledWith('A', 'c1', 'Кли', 'Ент');
  });

  it('update: тот же accountId (уже был привязан) → notifyLinked НЕ шлётся', async () => {
    const notifyLinked = vi.fn();
    // before: клиент УЖЕ привязан к acc-1 → перехода null→value нет.
    const getForTrainer = vi.fn(() => Promise.resolve(row({ id: 'c1', accountId: 'acc-1' })));
    const update = vi.fn(() => Promise.resolve(row({ id: 'c1', accountId: 'acc-1' })));
    const svc = makeSvc({
      accountExists: () => Promise.resolve(true),
      repo: { getForTrainer, update, findByAccountId: () => Promise.resolve(null) },
      notifyLinked,
    });
    await svc.update('A', 'c1', { accountId: 'acc-1' });
    expect(notifyLinked).not.toHaveBeenCalled();
  });

  it('update: отвязка (accountId=null) → notifyLinked НЕ шлётся', async () => {
    const notifyLinked = vi.fn();
    const update = vi.fn(() => Promise.resolve(row({ id: 'c1', accountId: null })));
    const svc = makeSvc({ repo: { update }, notifyLinked });
    await svc.update('A', 'c1', { accountId: null });
    expect(notifyLinked).not.toHaveBeenCalled();
  });
});
