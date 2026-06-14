import { describe, it, expect, vi } from 'vitest';
import type { SessionsRepo, SessionRow, UpdateSessionInput } from './sessions.repo.js';
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
    findByWorkoutId: vi.fn(() => Promise.resolve(null)),
    findEarliestPlanned: vi.fn(() => Promise.resolve(null)),
    createConducted: vi.fn(() => Promise.resolve(row({ status: 'completed' }))),
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
      fakeRepo({
        getForTrainer: vi.fn(() => Promise.resolve(row())),
        update: vi.fn(() => Promise.resolve(row({ title: 'Новое' }))),
      }),
      { newId: () => 'x' },
    );
    const res = await svc.update('A', 's1', { title: 'Новое' });
    expect(res.title).toBe('Новое');
  });

  it('перенос согласованного занятия обнуляет согласование и шлёт пуш клиенту', async () => {
    const update = vi.fn(() =>
      Promise.resolve(row({ date: '2026-06-05', clientConfirmation: 'pending' })),
    );
    const notifyClientPending = vi.fn();
    const svc = makeSessionsService(
      fakeRepo({
        getForTrainer: vi.fn(() => Promise.resolve(row({ clientConfirmation: 'confirmed' }))),
        update,
      }),
      { newId: () => 'x', notifyClientPending },
    );
    const res = await svc.update('A', 's1', { date: '2026-06-05' });
    // repo получил сброс согласования в pending.
    expect(update).toHaveBeenCalledWith(
      'A',
      's1',
      expect.objectContaining({ date: '2026-06-05', clientConfirmation: 'pending' }),
    );
    expect(res.clientConfirmation).toBe('pending');
    // Клиенту ушёл пуш о переносе.
    expect(notifyClientPending).toHaveBeenCalledTimes(1);
    expect(notifyClientPending).toHaveBeenCalledWith('c1', 'A', expect.any(Function));
  });

  it('перенос НЕсогласованного (pending) не трогает согласование и не шлёт пуш', async () => {
    const update = vi.fn((_t: string, _id: string, _patch: UpdateSessionInput) =>
      Promise.resolve(row({ date: '2026-06-05' })),
    );
    const notifyClientPending = vi.fn();
    const svc = makeSessionsService(
      fakeRepo({
        getForTrainer: vi.fn(() => Promise.resolve(row({ clientConfirmation: 'pending' }))),
        update,
      }),
      { newId: () => 'x', notifyClientPending },
    );
    await svc.update('A', 's1', { date: '2026-06-05' });
    expect(update.mock.calls[0]?.[2]?.clientConfirmation).toBeUndefined();
    expect(notifyClientPending).not.toHaveBeenCalled();
  });

  it('правка названия согласованного занятия (без переноса) не обнуляет согласование', async () => {
    const update = vi.fn((_t: string, _id: string, _patch: UpdateSessionInput) =>
      Promise.resolve(row({ title: 'X', clientConfirmation: 'confirmed' })),
    );
    const notifyClientPending = vi.fn();
    const svc = makeSessionsService(
      fakeRepo({
        getForTrainer: vi.fn(() => Promise.resolve(row({ clientConfirmation: 'confirmed' }))),
        update,
      }),
      { newId: () => 'x', notifyClientPending },
    );
    await svc.update('A', 's1', { title: 'X' });
    expect(update.mock.calls[0]?.[2]?.clientConfirmation).toBeUndefined();
    expect(notifyClientPending).not.toHaveBeenCalled();
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

  it('setClientConfirmation: отклонить уже подтверждённое занятие нельзя (409)', async () => {
    const getForTrainer = vi.fn(() => Promise.resolve(row({ clientConfirmation: 'confirmed' })));
    const setClientConfirmation = vi.fn(() => Promise.resolve(row()));
    const svc = makeSessionsService(fakeRepo({ getForTrainer, setClientConfirmation }), {
      newId: () => 'x',
    });
    await expect(svc.setClientConfirmation('A', 'c1', 's1', 'declined')).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_CONFIRMED',
    });
    // Запись не трогаем — подтверждение зафиксировано.
    expect(setClientConfirmation).not.toHaveBeenCalled();
  });

  it('setClientConfirmation: повторно подтвердить подтверждённое можно', async () => {
    const getForTrainer = vi.fn(() => Promise.resolve(row({ clientConfirmation: 'confirmed' })));
    const setClientConfirmation = vi.fn(() =>
      Promise.resolve(row({ clientConfirmation: 'confirmed' })),
    );
    const svc = makeSessionsService(fakeRepo({ getForTrainer, setClientConfirmation }), {
      newId: () => 'x',
    });
    const res = await svc.setClientConfirmation('A', 'c1', 's1', 'confirmed');
    expect(res.clientConfirmation).toBe('confirmed');
    // confirmed-ветка не читает текущее состояние.
    expect(getForTrainer).not.toHaveBeenCalled();
  });

  describe('reconcileFromWorkout', () => {
    const completedAt = new Date('2026-06-01T10:30:00');

    it('уже привязанное к тренировке занятие → отметка проведённым, без создания/пуша', async () => {
      const findByWorkoutId = vi.fn(() =>
        Promise.resolve(row({ id: 'sLinked', workoutId: 'w1', status: 'planned' })),
      );
      const update = vi.fn(() => Promise.resolve(row({ id: 'sLinked', status: 'completed' })));
      const createConducted = vi.fn(() => Promise.resolve(row()));
      const notify = vi.fn();
      const svc = makeSessionsService(fakeRepo({ findByWorkoutId, update, createConducted }), {
        newId: () => 'x',
        notifyClientPending: notify,
      });
      await svc.reconcileFromWorkout('A', 'c1', 'w1', 'Ноги', completedAt);
      expect(update).toHaveBeenCalledWith('A', 'sLinked', { status: 'completed' });
      expect(createConducted).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });

    it('есть запланированное в этот день → отметка проведённым + инфо-пуш', async () => {
      const findEarliestPlanned = vi.fn(() =>
        Promise.resolve(row({ id: 'sPlanned', date: '2026-06-01', startTime: '11:00' })),
      );
      const update = vi.fn(() => Promise.resolve(row({ id: 'sPlanned', status: 'completed' })));
      const createConducted = vi.fn(() => Promise.resolve(row()));
      const notify = vi.fn();
      const svc = makeSessionsService(
        fakeRepo({
          findByWorkoutId: vi.fn(() => Promise.resolve(null)),
          findEarliestPlanned,
          update,
          createConducted,
        }),
        { newId: () => 'x', notifyClientPending: notify },
      );
      await svc.reconcileFromWorkout('A', 'c1', 'w1', 'Ноги', completedAt);
      expect(update).toHaveBeenCalledWith('A', 'sPlanned', {
        status: 'completed',
        workoutId: 'w1',
      });
      expect(createConducted).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledTimes(1);
    });

    it('нет события в этот день → создаёт проведённое занятие + пуш на согласование', async () => {
      const createConducted = vi.fn(() => Promise.resolve(row({ status: 'completed' })));
      const update = vi.fn(() => Promise.resolve(null));
      const notify = vi.fn();
      const svc = makeSessionsService(
        fakeRepo({
          findByWorkoutId: vi.fn(() => Promise.resolve(null)),
          findEarliestPlanned: vi.fn(() => Promise.resolve(null)),
          createConducted,
          update,
        }),
        { newId: () => 'newid', notifyClientPending: notify },
      );
      await svc.reconcileFromWorkout('A', 'c1', 'w1', 'Ноги', completedAt);
      expect(createConducted).toHaveBeenCalledWith(
        expect.objectContaining({ trainerId: 'A', clientId: 'c1', workoutId: 'w1', title: 'Ноги' }),
      );
      expect(update).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledTimes(1);
    });
  });
});
