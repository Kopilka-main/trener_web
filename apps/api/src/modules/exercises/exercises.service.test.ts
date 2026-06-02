import { describe, it, expect, vi } from 'vitest';
import type { ExercisesRepo, ExerciseRow } from './exercises.repo.js';
import { makeExercisesService } from './exercises.service.js';

function row(over: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: 'e1',
    trainerId: 'A',
    name: 'Присед',
    category: 'Ноги',
    subgroup: null,
    description: null,
    defaultReps: null,
    defaultWeightKg: null,
    defaultTimeSec: null,
    restSec: 90,
    note: null,
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<ExercisesRepo> = {}): ExercisesRepo {
  return {
    list: vi.fn(() => Promise.resolve([])),
    getVisible: vi.fn(() => Promise.resolve(null)),
    getOwn: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve(row())),
    update: vi.fn(() => Promise.resolve(null)),
    delete: vi.fn(() => Promise.resolve('not_found' as const)),
    ...over,
  };
}

describe('exercises.service', () => {
  it('create генерирует id и зовёт repo.create со scope тренера', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeExercisesService(fakeRepo({ create }), { newId: () => 'newid' });
    const res = await svc.create('A', { name: 'Присед', category: 'Ноги', restSec: 90 });
    expect(res.id).toBe('e1');
    expect(res.isGlobal).toBe(false);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'newid', trainerId: 'A', name: 'Присед' }),
    );
  });

  it('create по умолчанию subgroup=null в ответе и передаёт null в repo', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeExercisesService(fakeRepo({ create }), { newId: () => 'newid' });
    const res = await svc.create('A', { name: 'Присед', category: 'Ноги', restSec: 90 });
    expect(res.subgroup).toBeNull();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ subgroup: null }));
  });

  it('create с subgroup пробрасывает его в repo и в ответ', async () => {
    const create = vi.fn(() => Promise.resolve(row({ subgroup: 'Квадрицепс' })));
    const svc = makeExercisesService(fakeRepo({ create }), { newId: () => 'newid' });
    const res = await svc.create('A', {
      name: 'Присед',
      category: 'Ноги',
      subgroup: 'Квадрицепс',
      restSec: 90,
    });
    expect(res.subgroup).toBe('Квадрицепс');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ subgroup: 'Квадрицепс' }));
  });

  it('update пробрасывает subgroup в repo-патч', async () => {
    const update = vi.fn(() => Promise.resolve(row({ subgroup: 'Ягодицы' })));
    const svc = makeExercisesService(fakeRepo({ update }), { newId: () => 'x' });
    const res = await svc.update('A', 'e1', { subgroup: 'Ягодицы' });
    expect(res.subgroup).toBe('Ягодицы');
    expect(update).toHaveBeenCalledWith(
      'A',
      'e1',
      expect.objectContaining({ subgroup: 'Ягодицы' }),
    );
  });

  it('get бросает 404, если запись не видна (repo.getVisible → null)', async () => {
    const svc = makeExercisesService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.get('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('get отдаёт глобальную запись с isGlobal=true', async () => {
    const svc = makeExercisesService(
      fakeRepo({ getVisible: vi.fn(() => Promise.resolve(row({ trainerId: null }))) }),
      { newId: () => 'x' },
    );
    const res = await svc.get('A', 'g1');
    expect(res.isGlobal).toBe(true);
  });

  it('update глобальной/чужой/несуществующей → 404 (repo.update → null)', async () => {
    const svc = makeExercisesService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.update('A', 'g1', { name: 'X' })).rejects.toMatchObject({ status: 404 });
  });

  it('update своей возвращает ответ', async () => {
    const svc = makeExercisesService(
      fakeRepo({ update: vi.fn(() => Promise.resolve(row({ name: 'Новое' }))) }),
      { newId: () => 'x' },
    );
    const res = await svc.update('A', 'e1', { name: 'Новое' });
    expect(res.name).toBe('Новое');
  });

  it('remove бросает 404, если delete=not_found', async () => {
    const svc = makeExercisesService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.remove('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('remove бросает 409 EXERCISE_IN_USE, если delete=in_use', async () => {
    const svc = makeExercisesService(
      fakeRepo({ delete: vi.fn(() => Promise.resolve('in_use' as const)) }),
      { newId: () => 'x' },
    );
    await expect(svc.remove('A', 'e1')).rejects.toMatchObject({
      status: 409,
      code: 'EXERCISE_IN_USE',
    });
  });
});
