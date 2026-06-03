import { describe, it, expect, vi } from 'vitest';
import type { SessionsRepo, SessionRow } from './sessions.repo.js';
import { makeSessionsService } from './sessions.service.js';

function row(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 's1',
    trainerId: 'A',
    clientId: 'c1',
    workoutId: null,
    date: '2026-06-01',
    startTime: '10:00',
    durationMin: 60,
    location: null,
    title: null,
    status: 'planned',
    isOnline: 0,
    note: null,
    clientConfirmation: 'pending',
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<SessionsRepo> = {}): SessionsRepo {
  return {
    isClientLinked: vi.fn(() => Promise.resolve(true)),
    create: vi.fn(() => Promise.resolve(row())),
    listByTrainer: vi.fn(() => Promise.resolve([])),
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    update: vi.fn(() => Promise.resolve(null)),
    delete: vi.fn(() => Promise.resolve(false)),
    listForClient: vi.fn(() => Promise.resolve([])),
    setClientConfirmation: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
}

const baseCreate = {
  clientId: 'c1',
  date: '2026-06-01',
  startTime: '10:00',
  durationMin: 60,
  location: null,
  title: null,
  isOnline: false,
  workoutId: null,
};

describe('sessions.service', () => {
  it('create со связанным клиентом генерирует id и зовёт repo.create', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSessionsService(fakeRepo({ create }), { newId: () => 'newid' });
    const res = await svc.create('A', baseCreate);
    expect(res.id).toBe('s1');
    expect(res.isOnline).toBe(false);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'newid', trainerId: 'A', clientId: 'c1' }),
    );
  });

  it('create с несвязанным клиентом → 400 CLIENT_NOT_LINKED', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeSessionsService(
      fakeRepo({ isClientLinked: vi.fn(() => Promise.resolve(false)), create }),
      { newId: () => 'x' },
    );
    await expect(svc.create('A', baseCreate)).rejects.toMatchObject({
      status: 400,
      code: 'CLIENT_NOT_LINKED',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('isOnline=true маппится в bool true в ответе', async () => {
    const svc = makeSessionsService(
      fakeRepo({ create: vi.fn(() => Promise.resolve(row({ isOnline: 1 }))) }),
      { newId: () => 'x' },
    );
    const res = await svc.create('A', { ...baseCreate, isOnline: true });
    expect(res.isOnline).toBe(true);
  });

  it('get бросает 404, если занятие не найдено (repo.getForTrainer → null)', async () => {
    const svc = makeSessionsService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.get('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('update несуществующего/чужого → 404 (repo.update → null)', async () => {
    const svc = makeSessionsService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.update('A', 's1', { title: 'X' })).rejects.toMatchObject({ status: 404 });
  });

  it('update со сменой clientId на несвязанного → 400 CLIENT_NOT_LINKED', async () => {
    const update = vi.fn(() => Promise.resolve(row()));
    const svc = makeSessionsService(
      fakeRepo({ isClientLinked: vi.fn(() => Promise.resolve(false)), update }),
      { newId: () => 'x' },
    );
    await expect(svc.update('A', 's1', { clientId: 'c2' })).rejects.toMatchObject({
      status: 400,
      code: 'CLIENT_NOT_LINKED',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('update своего возвращает ответ', async () => {
    const svc = makeSessionsService(
      fakeRepo({ update: vi.fn(() => Promise.resolve(row({ title: 'Новое' }))) }),
      { newId: () => 'x' },
    );
    const res = await svc.update('A', 's1', { title: 'Новое' });
    expect(res.title).toBe('Новое');
  });

  it('remove бросает 404, если delete=false', async () => {
    const svc = makeSessionsService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.remove('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('listForClient прокидывает trainerId, clientId и диапазон', async () => {
    const listForClient = vi.fn(() => Promise.resolve([row({ id: 's1' }), row({ id: 's2' })]));
    const svc = makeSessionsService(fakeRepo({ listForClient }), { newId: () => 'x' });
    const res = await svc.listForClient('A', 'c1', { from: '2026-06-01', to: '2026-06-30' });
    expect(res.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(listForClient).toHaveBeenCalledWith('A', 'c1', { from: '2026-06-01', to: '2026-06-30' });
  });

  it('setClientConfirmation резолвит обновлённое занятие', async () => {
    const setClientConfirmation = vi.fn(() =>
      Promise.resolve(row({ clientConfirmation: 'confirmed' })),
    );
    const svc = makeSessionsService(fakeRepo({ setClientConfirmation }), { newId: () => 'x' });
    const res = await svc.setClientConfirmation('A', 'c1', 's1', 'confirmed');
    expect(res.clientConfirmation).toBe('confirmed');
    expect(setClientConfirmation).toHaveBeenCalledWith('A', 'c1', 's1', 'confirmed');
  });

  it('setClientConfirmation → notFound, если repo вернул null', async () => {
    const setClientConfirmation = vi.fn(() => Promise.resolve(null));
    const svc = makeSessionsService(fakeRepo({ setClientConfirmation }), { newId: () => 'x' });
    await expect(svc.setClientConfirmation('A', 'c1', 'nope', 'declined')).rejects.toMatchObject({
      status: 404,
    });
  });
});
