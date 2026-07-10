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
    createdByClient: false,
    excludedFromBalance: false,
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
    addToHistory: vi.fn(() => Promise.resolve('updated' as const)),
    remove: vi.fn(() => Promise.resolve(false)),
    addExercise: vi.fn(() => Promise.resolve(row())),
    removeExercise: vi.fn(() => Promise.resolve(row())),
    reorderExercises: vi.fn(() => Promise.resolve(row())),
    addSet: vi.fn(() => Promise.resolve(row())),
    deleteSet: vi.fn(() => Promise.resolve(row())),
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
      false,
    );
  });

  it('create по умолчанию createdByClient=false; ответ отражает флаг строки', async () => {
    const create = vi.fn(() => Promise.resolve(row({ createdByClient: false })));
    const svc = makeClientWorkoutsService(fakeRepo({ create }), deps);
    const res = await svc.create('A', 'c1', {
      name: 'День 1',
      exercises: [{ exerciseId: 'g1', sets: [{ plannedReps: 10 }] }],
    });
    expect(res.createdByClient).toBe(false);
    expect(create).toHaveBeenCalledWith('A', 'c1', expect.objectContaining({ id: 'newid' }), false);
  });

  it('create с createdByClient=true прокидывает флаг в repo и в ответ', async () => {
    const create = vi.fn(() => Promise.resolve(row({ createdByClient: true })));
    const svc = makeClientWorkoutsService(fakeRepo({ create }), deps);
    const res = await svc.create(
      'A',
      'c1',
      { name: 'Моя', exercises: [{ exerciseId: 'g1', sets: [{ plannedReps: 10 }] }] },
      true,
    );
    expect(res.createdByClient).toBe(true);
    expect(create).toHaveBeenCalledWith('A', 'c1', expect.objectContaining({ id: 'newid' }), true);
  });

  it('list по умолчанию owner=all; прокидывается в repo', async () => {
    const listForClient = vi.fn(() => Promise.resolve([row()]));
    const svc = makeClientWorkoutsService(fakeRepo({ listForClient }), deps);
    await svc.list('A', 'c1');
    expect(listForClient).toHaveBeenCalledWith('A', 'c1', 'all');
  });

  it('list с owner=trainer прокидывает фильтр владельца в repo', async () => {
    const listForClient = vi.fn(() => Promise.resolve([]));
    const svc = makeClientWorkoutsService(fakeRepo({ listForClient }), deps);
    await svc.list('A', 'c1', 'trainer');
    expect(listForClient).toHaveBeenCalledWith('A', 'c1', 'trainer');
  });

  it('start с ownedByClientOnly прокидывает флаг в repo', async () => {
    const setStatusActive = vi.fn(() => Promise.resolve('updated' as const));
    const svc = makeClientWorkoutsService(
      fakeRepo({
        setStatusActive,
        getFull: vi.fn(() => Promise.resolve(row({ status: 'active', createdByClient: true }))),
      }),
      deps,
    );
    await svc.start('A', 'c1', 'w1', { ownedByClientOnly: true });
    expect(setStatusActive).toHaveBeenCalledWith('A', 'c1', 'w1', deps.now(), true);
  });

  it('start чужой/тренерской с ownedByClientOnly (repo → not_found) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ setStatusActive: vi.fn(() => Promise.resolve('not_found' as const)) }),
      deps,
    );
    await expect(svc.start('A', 'c1', 'w1', { ownedByClientOnly: true })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('updateSet с ownedByClientOnly прокидывает флаг в repo', async () => {
    const updateSet = vi.fn(() => Promise.resolve(row({ createdByClient: true })));
    const svc = makeClientWorkoutsService(fakeRepo({ updateSet }), deps);
    await svc.updateSet('A', 'c1', 'w1', 0, 0, { done: true }, { ownedByClientOnly: true });
    expect(updateSet).toHaveBeenCalledWith(
      'A',
      'c1',
      'w1',
      0,
      0,
      expect.objectContaining({ done: true }),
      true,
    );
  });

  it('complete с ownedByClientOnly прокидывает флаг в repo', async () => {
    const complete = vi.fn(() => Promise.resolve('updated' as const));
    const svc = makeClientWorkoutsService(
      fakeRepo({
        complete,
        getFull: vi.fn(() => Promise.resolve(row({ status: 'completed', createdByClient: true }))),
      }),
      deps,
    );
    await svc.complete('A', 'c1', 'w1', { rpe: 8 }, { ownedByClientOnly: true });
    expect(complete).toHaveBeenCalledWith(
      'A',
      'c1',
      'w1',
      expect.objectContaining({ rpe: 8 }),
      deps.now(),
      true,
    );
  });

  it('addToHistory: completed датой (полдень UTC), без onCompleted, excludedFromBalance', async () => {
    const addToHistory = vi.fn(() => Promise.resolve('updated' as const));
    const onCompleted = vi.fn(() => Promise.resolve());
    const svc = makeClientWorkoutsService(
      fakeRepo({
        addToHistory,
        getFull: vi.fn(() =>
          Promise.resolve(row({ status: 'completed', excludedFromBalance: true })),
        ),
      }),
      { ...deps, onCompleted },
    );
    const res = await svc.addToHistory('A', 'c1', 'w1', '2026-06-04');
    expect(addToHistory).toHaveBeenCalledWith(
      'A',
      'c1',
      'w1',
      new Date('2026-06-04T12:00:00.000Z'),
    );
    expect(onCompleted).not.toHaveBeenCalled();
    expect(res.excludedFromBalance).toBe(true);
  });

  it('addToHistory: repo bad_status → 409', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ addToHistory: vi.fn(() => Promise.resolve('bad_status' as const)) }),
      deps,
    );
    await expect(svc.addToHistory('A', 'c1', 'w1', '2026-06-04')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('create с excludedFromBalance=true (тренер) не уведомляет клиента', async () => {
    const notify = vi.fn();
    const svc = makeClientWorkoutsService(fakeRepo(), { ...deps, notify });
    await svc.create('A', 'c1', { name: 'История', exercises: [], excludedFromBalance: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('remove с ownedByClientOnly прокидывает флаг в repo', async () => {
    const remove = vi.fn(() => Promise.resolve(true));
    const svc = makeClientWorkoutsService(fakeRepo({ remove }), deps);
    await svc.remove('A', 'c1', 'w1', { ownedByClientOnly: true });
    expect(remove).toHaveBeenCalledWith('A', 'c1', 'w1', true);
  });

  it('remove тренерской с ownedByClientOnly (repo → false) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ remove: vi.fn(() => Promise.resolve(false)) }),
      deps,
    );
    await expect(svc.remove('A', 'c1', 'w1', { ownedByClientOnly: true })).rejects.toMatchObject({
      status: 404,
    });
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
    expect(setStatusActive).toHaveBeenCalledWith('A', 'c1', 'w1', deps.now(), false);
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
      false,
    );
  });

  it('updateSet прокидывает плановые значения подхода', async () => {
    const updateSet = vi.fn(() => Promise.resolve(row()));
    const svc = makeClientWorkoutsService(fakeRepo({ updateSet }), deps);
    await svc.updateSet('A', 'c1', 'w1', 0, 0, {
      plannedReps: 8,
      plannedWeightKg: 60,
      plannedTimeSec: null,
    });
    expect(updateSet).toHaveBeenCalledWith(
      'A',
      'c1',
      'w1',
      0,
      0,
      expect.objectContaining({ plannedReps: 8, plannedWeightKg: 60, plannedTimeSec: null }),
      false,
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
      false,
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
      false,
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

  // --- addSet ---

  it('addSet: пробрасывает плановые поля в repo и возвращает маппинг тренировки', async () => {
    const addSet = vi.fn(() => Promise.resolve(row()));
    const svc = makeClientWorkoutsService(fakeRepo({ addSet }), deps);
    const res = await svc.addSet('A', 'c1', 'w1', 0, { plannedReps: 10, plannedWeightKg: 50 });
    expect(addSet).toHaveBeenCalledWith('A', 'c1', 'w1', 0, {
      plannedReps: 10,
      plannedWeightKg: 50,
      plannedTimeSec: null,
      plannedRestSec: null,
    });
    expect(res.id).toBe('w1');
  });

  it('addSet: тренировка не найдена (repo → null) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ addSet: vi.fn(() => Promise.resolve(null)) }),
      deps,
    );
    await expect(svc.addSet('A', 'c1', 'missing', 0, {})).rejects.toMatchObject({ status: 404 });
  });

  it('addSet: not_found_pos → 404 "Упражнение не найдено"', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ addSet: vi.fn(() => Promise.resolve('not_found_pos' as const)) }),
      deps,
    );
    await expect(svc.addSet('A', 'c1', 'w1', 9, {})).rejects.toMatchObject({ status: 404 });
  });

  // --- deleteSet ---

  it('deleteSet: прокидывает pos/idx и возвращает маппинг тренировки', async () => {
    const deleteSet = vi.fn(() => Promise.resolve(row()));
    const svc = makeClientWorkoutsService(fakeRepo({ deleteSet }), deps);
    const res = await svc.deleteSet('A', 'c1', 'w1', 0, 1);
    expect(deleteSet).toHaveBeenCalledWith('A', 'c1', 'w1', 0, 1);
    expect(res.id).toBeDefined();
  });

  it('deleteSet: тренировка не найдена (repo → null) → 404', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ deleteSet: vi.fn(() => Promise.resolve(null)) }),
      deps,
    );
    await expect(svc.deleteSet('A', 'c1', 'missing', 0, 0)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('deleteSet: not_found_pos → 404 "Упражнение не найдено"', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ deleteSet: vi.fn(() => Promise.resolve('not_found_pos' as const)) }),
      deps,
    );
    await expect(svc.deleteSet('A', 'c1', 'w1', 9, 0)).rejects.toMatchObject({ status: 404 });
  });

  it('deleteSet: not_found_set → 404 "Подход не найден"', async () => {
    const svc = makeClientWorkoutsService(
      fakeRepo({ deleteSet: vi.fn(() => Promise.resolve('not_found_set' as const)) }),
      deps,
    );
    await expect(svc.deleteSet('A', 'c1', 'w1', 0, 5)).rejects.toMatchObject({ status: 404 });
  });
});
