import { describe, it, expect, vi } from 'vitest';
import type { ClientWorkoutsRepo, WorkoutRow } from './client-workouts.repo.js';
import { makeClientWorkoutsService } from './client-workouts.service.js';

function row(over: Partial<WorkoutRow> = {}): WorkoutRow {
  return {
    id: 'w1',
    trainerId: 'A',
    clientId: 'c1',
    name: 'День 1',
    status: 'draft',
    startedAt: null,
    completedAt: null,
    durationSec: null,
    trainerNote: null,
    rpe: null,
    createdAt: new Date(0),
    exercises: [
      {
        position: 0,
        exerciseId: 'g1',
        exerciseName: 'Жим лёжа',
        sets: [
          {
            setIndex: 0,
            plannedReps: 10,
            plannedWeightKg: null,
            plannedTimeSec: null,
            plannedRestSec: 90,
            actualReps: null,
            actualWeightKg: null,
            actualTimeSec: null,
            done: false,
          },
        ],
      },
    ],
    ...over,
  };
}

function fakeRepo(over: Partial<ClientWorkoutsRepo> = {}): ClientWorkoutsRepo {
  return {
    areExercisesVisible: vi.fn(() => Promise.resolve(true)),
    getFull: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve(row())),
    listForClient: vi.fn(() => Promise.resolve([])),
    setStatusActive: vi.fn(() => Promise.resolve(true)),
    updateSet: vi.fn(() => Promise.resolve(row())),
    complete: vi.fn(() => Promise.resolve(true)),
    remove: vi.fn(() => Promise.resolve(false)),
    ...over,
  };
}

const deps = { newId: () => 'newid', now: () => new Date('2026-05-31T10:00:00.000Z') };

describe('client-workouts.service', () => {
  it('create генерирует id, прокидывает scope тренер+клиент и резолвит ответ', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeClientWorkoutsService(fakeRepo({ create }), deps);
    const res = await svc.create('A', 'c1', {
      name: 'День 1',
      exercises: [{ exerciseId: 'g1', sets: [{ plannedReps: 10 }] }],
    });
    expect(res.clientId).toBe('c1');
    expect(res.exercises[0]?.exerciseName).toBe('Жим лёжа');
    expect(create).toHaveBeenCalledWith(
      'A',
      'c1',
      expect.objectContaining({ id: 'newid', name: 'День 1' }),
    );
  });

  it('create с невидимым упражнением (repo.create → null) → 400 UNKNOWN_EXERCISE', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ create: vi.fn(() => Promise.resolve(null)) }),
      deps,
    );
    await expect(
      svc.create('A', 'c1', { name: 'X', exercises: [{ exerciseId: 'bad', sets: [{}] }] }),
    ).rejects.toMatchObject({ status: 400, code: 'UNKNOWN_EXERCISE' });
  });

  it('get бросает 404, если repo.getFull → null', async () => {
    const svc = makeClientWorkoutsService(fakeRepo(), deps);
    await expect(svc.get('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('start из draft → active, использует now() из clock', async () => {
    const setStatusActive = vi.fn(() => Promise.resolve(true));
    const svc = makeClientWorkoutsService(
      fakeRepo({
        getFull: vi
          .fn()
          .mockResolvedValueOnce(row({ status: 'draft' }))
          .mockResolvedValueOnce(row({ status: 'active', startedAt: deps.now() })),
        setStatusActive,
      }),
      deps,
    );
    const res = await svc.start('A', 'c1', 'w1');
    expect(res.status).toBe('active');
    expect(setStatusActive).toHaveBeenCalledWith('A', 'c1', 'w1', deps.now());
  });

  it('start несуществующей → 404', async () => {
    const svc = makeClientWorkoutsService(fakeRepo(), deps);
    await expect(svc.start('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('start из не-draft → 409 BAD_STATUS', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ getFull: vi.fn(() => Promise.resolve(row({ status: 'active' }))) }),
      deps,
    );
    await expect(svc.start('A', 'c1', 'w1')).rejects.toMatchObject({
      status: 409,
      code: 'BAD_STATUS',
    });
  });

  it('updateSet с отсутствующим подходом (repo → null) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ updateSet: vi.fn(() => Promise.resolve(null)) }),
      deps,
    );
    await expect(svc.updateSet('A', 'c1', 'w1', 0, 99, { done: true })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('updateSet прокидывает позицию/индекс/patch и резолвит ответ', async () => {
    const updateSet = vi.fn(() => Promise.resolve(row()));
    const svc = makeClientWorkoutsService(fakeRepo({ updateSet }), deps);
    await svc.updateSet('A', 'c1', 'w1', 0, 0, { actualReps: 12, done: true });
    expect(updateSet).toHaveBeenCalledWith(
      'A',
      'c1',
      'w1',
      0,
      0,
      expect.objectContaining({ actualReps: 12, done: true }),
    );
  });

  it('complete из active → completed, использует now()', async () => {
    const complete = vi.fn(() => Promise.resolve(true));
    const svc = makeClientWorkoutsService(
      fakeRepo({
        getFull: vi
          .fn()
          .mockResolvedValueOnce(row({ status: 'active' }))
          .mockResolvedValueOnce(row({ status: 'completed', completedAt: deps.now() })),
        complete,
      }),
      deps,
    );
    const res = await svc.complete('A', 'c1', 'w1', { rpe: 8 });
    expect(res.status).toBe('completed');
    expect(complete).toHaveBeenCalledWith(
      'A',
      'c1',
      'w1',
      expect.objectContaining({ rpe: 8 }),
      deps.now(),
    );
  });

  it('complete несуществующей → 404', async () => {
    const svc = makeClientWorkoutsService(fakeRepo(), deps);
    await expect(svc.complete('A', 'c1', 'missing', {})).rejects.toMatchObject({ status: 404 });
  });

  it('complete из не-active → 409 BAD_STATUS', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ getFull: vi.fn(() => Promise.resolve(row({ status: 'draft' }))) }),
      deps,
    );
    await expect(svc.complete('A', 'c1', 'w1', {})).rejects.toMatchObject({
      status: 409,
      code: 'BAD_STATUS',
    });
  });

  it('remove бросает 404, если repo.remove=false', async () => {
    const svc = makeClientWorkoutsService(fakeRepo(), deps);
    await expect(svc.remove('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });
});
