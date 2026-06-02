import { describe, it, expect, vi } from 'vitest';
import type { ClientsRepo, ClientRow } from './clients.repo.js';
import { makeClientsService } from './clients.service.js';

function row(over: Partial<ClientRow> = {}): ClientRow {
  return {
    id: 'c1',
    firstName: 'Кли',
    lastName: 'Ент',
    phone: null,
    accountId: null,
    notes: null,
    status: 'active',
    contacts: [],
    tags: [],
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
    unlink: vi.fn(() => Promise.resolve(false)),
    ...over,
  };
}

describe('clients.service', () => {
  it('create генерирует id и зовёт repo.create со scope тренера', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const repo = fakeRepo({ create });
    const svc = makeClientsService(repo, { newId: () => 'newid' });
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
    const repo = fakeRepo({ create });
    const svc = makeClientsService(repo, { newId: () => 'newid' });
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
    const repo = fakeRepo({ create });
    const svc = makeClientsService(repo, { newId: () => 'newid' });
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
    const repo = fakeRepo({ create });
    const svc = makeClientsService(repo, { newId: () => 'newid' });
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
    const repo = fakeRepo({ create });
    const svc = makeClientsService(repo, { newId: () => 'newid' });
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

  it('get бросает 404, если repo вернул null', async () => {
    const svc = makeClientsService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.get('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('update бросает 404, если repo вернул null', async () => {
    const svc = makeClientsService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.update('A', 'missing', { notes: 'n' })).rejects.toMatchObject({ status: 404 });
  });

  it('unlink бросает 404, если связи не было', async () => {
    const svc = makeClientsService(fakeRepo({ unlink: vi.fn(() => Promise.resolve(false)) }), {
      newId: () => 'x',
    });
    await expect(svc.unlink('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });
});
