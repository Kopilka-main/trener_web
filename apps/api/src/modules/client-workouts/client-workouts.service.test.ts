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
    setStatusActive: vi.fn(() => Promise.resolve('updated' as const)),
    updateSet: vi.fn(() => Promise.resolve(row())),
    complete: vi.fn(() => Promise.resolve('updated' as const)),
    remove: vi.fn(() => Promise.resolve(false)),
    addExercise: vi.fn(() => Promise.resolve(row())),
    removeExercise: vi.fn(() => Promise.resolve(row())),
    reorderExercises: vi.fn(() => Promise.resolve(row())),
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

  it('start из draft → active, использует now() из clock (атомарно)', async () => {
    const setStatusActive = vi.fn(() => Promise.resolve('updated' as const));
    const svc = makeClientWorkoutsService(
      fakeRepo({
        setStatusActive,
        getFull: vi.fn(() => Promise.resolve(row({ status: 'active', startedAt: deps.now() }))),
      }),
      deps,
    );
    const res = await svc.start('A', 'c1', 'w1');
    expect(res.status).toBe('active');
    expect(setStatusActive).toHaveBeenCalledWith('A', 'c1', 'w1', deps.now());
  });

  it('start несуществующей (repo → not_found) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ setStatusActive: vi.fn(() => Promise.resolve('not_found' as const)) }),
      deps,
    );
    await expect(svc.start('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('start из не-draft (repo → bad_status) → 409 BAD_STATUS', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ setStatusActive: vi.fn(() => Promise.resolve('bad_status' as const)) }),
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

  it('complete из active → completed, использует now() (атомарно)', async () => {
    const complete = vi.fn(() => Promise.resolve('updated' as const));
    const svc = makeClientWorkoutsService(
      fakeRepo({
        complete,
        getFull: vi.fn(() =>
          Promise.resolve(row({ status: 'completed', completedAt: deps.now() })),
        ),
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

  it('complete несуществующей (repo → not_found) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ complete: vi.fn(() => Promise.resolve('not_found' as const)) }),
      deps,
    );
    await expect(svc.complete('A', 'c1', 'missing', {})).rejects.toMatchObject({ status: 404 });
  });

  it('complete из не-active (repo → bad_status) → 409 BAD_STATUS', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ complete: vi.fn(() => Promise.resolve('bad_status' as const)) }),
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

  // --- addExercise ---

  it('addExercise добавляет упражнение и прокидывает scope+план в repo', async () => {
    const addExercise = vi.fn(() =>
      Promise.resolve(
        row({
          exercises: [
            ...row().exercises,
            {
              position: 1,
              exerciseId: 'g2',
              exerciseName: 'Присед',
              sets: [
                {
                  setIndex: 0,
                  plannedReps: 8,
                  plannedWeightKg: null,
                  plannedTimeSec: null,
                  plannedRestSec: null,
                  actualReps: null,
                  actualWeightKg: null,
                  actualTimeSec: null,
                  done: false,
                },
              ],
            },
          ],
        }),
      ),
    );
    const svc = makeClientWorkoutsService(
      fakeRepo({ getFull: vi.fn(() => Promise.resolve(row())), addExercise }),
      deps,
    );
    const res = await svc.addExercise('A', 'c1', 'w1', {
      exerciseId: 'g2',
      sets: [{ plannedReps: 8 }],
    });
    const last = res.exercises.at(-1);
    expect(last?.position).toBe(1);
    expect(last?.exerciseId).toBe('g2');
    expect(addExercise).toHaveBeenCalledWith(
      'A',
      'c1',
      'w1',
      expect.objectContaining({ exerciseId: 'g2' }),
    );
  });

  it('addExercise в отсутствующую тренировку (getFull → null) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ getFull: vi.fn(() => Promise.resolve(null)) }),
      deps,
    );
    await expect(
      svc.addExercise('A', 'c1', 'missing', { exerciseId: 'g2', sets: [{}] }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('addExercise с невидимым упражнением → 400 UNKNOWN_EXERCISE', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({
        getFull: vi.fn(() => Promise.resolve(row())),
        areExercisesVisible: vi.fn(() => Promise.resolve(false)),
      }),
      deps,
    );
    await expect(
      svc.addExercise('A', 'c1', 'w1', { exerciseId: 'bad', sets: [{}] }),
    ).rejects.toMatchObject({ status: 400, code: 'UNKNOWN_EXERCISE' });
  });

  // --- removeExercise ---

  it('removeExercise возвращает обновлённую тренировку с перенумерованными позициями', async () => {
    const renumbered = row({
      exercises: [{ position: 0, exerciseId: 'g2', exerciseName: 'Присед', sets: [] }],
    });
    const removeExercise = vi.fn(() => Promise.resolve(renumbered));
    const svc = makeClientWorkoutsService(fakeRepo({ removeExercise }), deps);
    const res = await svc.removeExercise('A', 'c1', 'w1', 0);
    expect(res.exercises).toHaveLength(1);
    expect(res.exercises[0]?.position).toBe(0);
    expect(removeExercise).toHaveBeenCalledWith('A', 'c1', 'w1', 0);
  });

  it('removeExercise несуществующей тренировки (repo → null) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ removeExercise: vi.fn(() => Promise.resolve(null)) }),
      deps,
    );
    await expect(svc.removeExercise('A', 'c1', 'missing', 0)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('removeExercise несуществующей позиции (repo → not_found_pos) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ removeExercise: vi.fn(() => Promise.resolve('not_found_pos' as const)) }),
      deps,
    );
    await expect(svc.removeExercise('A', 'c1', 'w1', 99)).rejects.toMatchObject({ status: 404 });
  });

  // --- reorderExercises ---

  it('reorderExercises прокидывает order и возвращает новый порядок', async () => {
    const reordered = row({
      exercises: [
        { position: 0, exerciseId: 'g2', exerciseName: 'Присед', sets: [] },
        { position: 1, exerciseId: 'g1', exerciseName: 'Жим лёжа', sets: [] },
      ],
    });
    const reorderExercises = vi.fn(() => Promise.resolve(reordered));
    const svc = makeClientWorkoutsService(fakeRepo({ reorderExercises }), deps);
    const res = await svc.reorderExercises('A', 'c1', 'w1', [1, 0]);
    expect(res.exercises.map((e) => e.exerciseId)).toEqual(['g2', 'g1']);
    expect(reorderExercises).toHaveBeenCalledWith('A', 'c1', 'w1', [1, 0]);
  });

  it('reorderExercises с неверным набором (repo → bad_order) → 400 BAD_ORDER', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ reorderExercises: vi.fn(() => Promise.resolve('bad_order' as const)) }),
      deps,
    );
    await expect(svc.reorderExercises('A', 'c1', 'w1', [0, 5])).rejects.toMatchObject({
      status: 400,
      code: 'BAD_ORDER',
    });
  });

  it('reorderExercises несуществующей тренировки (repo → null) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ reorderExercises: vi.fn(() => Promise.resolve(null)) }),
      deps,
    );
    await expect(svc.reorderExercises('A', 'c1', 'missing', [0])).rejects.toMatchObject({
      status: 404,
    });
  });
});
