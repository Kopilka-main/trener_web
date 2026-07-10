import { describe, it, expect, vi } from 'vitest';
import type { TemplatesRepo, TemplateRow } from './templates.repo.js';
import { makeTemplatesService } from './templates.service.js';

function row(over: Partial<TemplateRow> = {}): TemplateRow {
  return {
    id: 't1',
    trainerId: 'A',
    name: 'День ног',
    categoryTag: 'legs',
    shortDescription: null,
    clientId: null,
    clientName: null,
    createdAt: new Date(0),
    exercises: [
      {
        position: 0,
        exerciseId: 'g1',
        exerciseName: 'Жим лёжа',
        sets: 3,
        reps: 10,
        weightKg: null,
        timeSec: null,
        restSec: 90,
      },
    ],
    ...over,
  };
}

function fakeRepo(over: Partial<TemplatesRepo> = {}): TemplatesRepo {
  return {
    areExercisesVisible: vi.fn(() => Promise.resolve(true)),
    isClientLinked: vi.fn(() => Promise.resolve(true)),
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve(row())),
    listByTrainer: vi.fn(() => Promise.resolve([])),
    update: vi.fn(() => Promise.resolve(null)),
    delete: vi.fn(() => Promise.resolve(false)),
    ...over,
  };
}

describe('templates.service', () => {
  it('create генерирует id, прокидывает scope тренера и резолвит ответ', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeTemplatesService(fakeRepo({ create }), { newId: () => 'newid' });
    const res = await svc.create('A', {
      name: 'День ног',
      categoryTag: 'legs',
      exercises: [{ exerciseId: 'g1', sets: 3, reps: 10, restSec: 90 }],
    });
    expect(res.id).toBe('t1');
    expect(res.exercises[0]?.exerciseName).toBe('Жим лёжа');
    expect(create).toHaveBeenCalledWith(
      'A',
      expect.objectContaining({ id: 'newid', trainerId: 'A', name: 'День ног' }),
    );
  });

  it('create прокидывает shortDescription в repo и возвращает его в ответе', async () => {
    const create = vi.fn(() => Promise.resolve(row({ shortDescription: 'Силовая на верх' })));
    const svc = makeTemplatesService(fakeRepo({ create }), { newId: () => 'newid' });
    const res = await svc.create('A', {
      name: 'День ног',
      shortDescription: 'Силовая на верх',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    expect(res.shortDescription).toBe('Силовая на верх');
    expect(create).toHaveBeenCalledWith(
      'A',
      expect.objectContaining({ shortDescription: 'Силовая на верх' }),
    );
  });

  it('create без shortDescription → null в repo и в ответе', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeTemplatesService(fakeRepo({ create }), { newId: () => 'newid' });
    const res = await svc.create('A', {
      name: 'День ног',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    expect(res.shortDescription).toBeNull();
    expect(create).toHaveBeenCalledWith('A', expect.objectContaining({ shortDescription: null }));
  });

  it('create персонального: clientId связан → сохранён с clientId, ответ несёт clientId/clientName', async () => {
    const isClientLinked = vi.fn(() => Promise.resolve(true));
    const create = vi.fn(() =>
      Promise.resolve(row({ clientId: 'cl1', clientName: 'Иван Петров' })),
    );
    const svc = makeTemplatesService(fakeRepo({ isClientLinked, create }), {
      newId: () => 'newid',
    });
    const res = await svc.create('A', {
      name: 'Персональный',
      clientId: 'cl1',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    expect(isClientLinked).toHaveBeenCalledWith('A', 'cl1');
    expect(create).toHaveBeenCalledWith('A', expect.objectContaining({ clientId: 'cl1' }));
    expect(res.clientId).toBe('cl1');
    expect(res.clientName).toBe('Иван Петров');
  });

  it('create с чужим clientId (isClientLinked → false) → 400 CLIENT_NOT_LINKED, repo.create не зовётся', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeTemplatesService(
      fakeRepo({ isClientLinked: vi.fn(() => Promise.resolve(false)), create }),
      { newId: () => 'newid' },
    );
    await expect(
      svc.create('A', {
        name: 'Чужой',
        clientId: 'foreign',
        exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
      }),
    ).rejects.toMatchObject({ status: 400, code: 'CLIENT_NOT_LINKED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('create общего (без clientId): clientId=null в repo, isClientLinked не зовётся', async () => {
    const isClientLinked = vi.fn(() => Promise.resolve(true));
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeTemplatesService(fakeRepo({ isClientLinked, create }), {
      newId: () => 'newid',
    });
    const res = await svc.create('A', {
      name: 'Общий',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    expect(isClientLinked).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith('A', expect.objectContaining({ clientId: null }));
    expect(res.clientId).toBeNull();
    expect(res.clientName).toBeNull();
  });

  it('list возвращает clientId/clientName: персональный и общий', async () => {
    const svc = makeTemplatesService(
      fakeRepo({
        listByTrainer: vi.fn(() =>
          Promise.resolve([
            row({ id: 'p1', clientId: 'cl1', clientName: 'Иван Петров' }),
            row({ id: 'g1', clientId: null, clientName: null }),
          ]),
        ),
      }),
      { newId: () => 'x' },
    );
    const res = await svc.list('A');
    expect(res[0]).toMatchObject({ id: 'p1', clientId: 'cl1', clientName: 'Иван Петров' });
    expect(res[1]).toMatchObject({ id: 'g1', clientId: null, clientName: null });
  });

  it('create с невидимым упражнением (repo.create → null) → 400 UNKNOWN_EXERCISE', async () => {
    const svc = makeTemplatesService(fakeRepo({ create: vi.fn(() => Promise.resolve(null)) }), {
      newId: () => 'x',
    });
    await expect(
      svc.create('A', { name: 'X', exercises: [{ exerciseId: 'bad', sets: 1, restSec: 90 }] }),
    ).rejects.toMatchObject({ status: 400, code: 'UNKNOWN_EXERCISE' });
  });

  it('get бросает 404, если repo.getForTrainer → null', async () => {
    const svc = makeTemplatesService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.get('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('update несуществующего/чужого → 404', async () => {
    const svc = makeTemplatesService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.update('A', 'missing', { name: 'X' })).rejects.toMatchObject({ status: 404 });
  });

  it('update с невидимым упражнением → 400 UNKNOWN_EXERCISE (шаблон существует, repo.update → null)', async () => {
    const svc = makeTemplatesService(
      fakeRepo({
        getForTrainer: vi.fn(() => Promise.resolve(row())),
        update: vi.fn(() => Promise.resolve(null)),
      }),
      { newId: () => 'x' },
    );
    await expect(
      svc.update('A', 't1', { exercises: [{ exerciseId: 'bad', sets: 1, restSec: 90 }] }),
    ).rejects.toMatchObject({ status: 400, code: 'UNKNOWN_EXERCISE' });
  });

  it('update своей возвращает ответ', async () => {
    const svc = makeTemplatesService(
      fakeRepo({
        getForTrainer: vi.fn(() => Promise.resolve(row())),
        update: vi.fn(() => Promise.resolve(row({ name: 'Новое' }))),
      }),
      { newId: () => 'x' },
    );
    const res = await svc.update('A', 't1', { name: 'Новое' });
    expect(res.name).toBe('Новое');
  });

  it('remove бросает 404, если delete=false', async () => {
    const svc = makeTemplatesService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.remove('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });
});
