import { describe, expect, it } from 'vitest';
import type { WorkoutResponse, WorkoutSetResponse } from '@trener/shared';
import { aggregateClientStats, aggregateExerciseOverview, workoutRowStats } from './workout-stats';

function set(over: Partial<WorkoutSetResponse>): WorkoutSetResponse {
  return {
    setIndex: 0,
    plannedReps: null,
    plannedWeightKg: null,
    plannedTimeSec: null,
    plannedRestSec: null,
    actualReps: null,
    actualWeightKg: null,
    actualTimeSec: null,
    done: false,
    ...over,
  };
}

function workout(over: Partial<WorkoutResponse>): WorkoutResponse {
  return {
    id: 'w',
    clientId: 'c',
    name: 'Тренировка',
    status: 'completed',
    startedAt: null,
    completedAt: '2026-05-01T10:00:00.000Z',
    durationSec: null,
    trainerNote: null,
    rpe: null,
    createdByClient: false,
    exercises: [],
    ...over,
  };
}

describe('aggregateClientStats', () => {
  it('считает по завершённым тренировкам: тоннаж, подходы, повторы, время, средний RPE', () => {
    const list: WorkoutResponse[] = [
      workout({
        id: 'w1',
        durationSec: 3600,
        rpe: 8,
        exercises: [
          {
            position: 0,
            exerciseId: 'e1',
            exerciseName: 'Жим',
            sets: [
              set({ done: true, actualWeightKg: 50, actualReps: 10 }), // 500
              set({ done: true, actualWeightKg: 50, actualReps: 8 }), // 400
            ],
          },
        ],
      }),
      workout({
        id: 'w2',
        durationSec: 1800,
        rpe: 6,
        exercises: [
          {
            position: 0,
            exerciseId: 'e2',
            exerciseName: 'Присед',
            sets: [
              set({ done: true, actualWeightKg: 80, actualReps: 5 }), // 400
              set({ done: false, actualWeightKg: 80, actualReps: 5 }), // не выполнен
            ],
          },
        ],
      }),
    ];

    const stats = aggregateClientStats(list);
    expect(stats.completedWorkouts).toBe(2);
    expect(stats.tonnageKg).toBe(1300);
    expect(stats.doneSets).toBe(3);
    expect(stats.totalReps).toBe(23);
    expect(stats.avgRpe).toBe(7);
    expect(stats.totalDurationSec).toBe(5400);
  });

  it('игнорирует незавершённые тренировки', () => {
    const list: WorkoutResponse[] = [
      workout({ id: 'd', status: 'draft', durationSec: 999 }),
      workout({ id: 'a', status: 'active' }),
      workout({ id: 's', status: 'skipped', rpe: 10 }),
    ];
    const stats = aggregateClientStats(list);
    expect(stats.completedWorkouts).toBe(0);
    expect(stats.totalDurationSec).toBe(0);
    expect(stats.avgRpe).toBeNull();
  });

  it('не учитывает в тоннаже подходы без факта по весу/повторам', () => {
    const list: WorkoutResponse[] = [
      workout({
        exercises: [
          {
            position: 0,
            exerciseId: 'e',
            exerciseName: 'Планка',
            sets: [
              set({ done: true, actualTimeSec: 60 }), // вес/повторы не заданы
              set({ done: true, actualReps: 12 }), // вес не задан
            ],
          },
        ],
      }),
    ];
    const stats = aggregateClientStats(list);
    expect(stats.tonnageKg).toBe(0);
    expect(stats.doneSets).toBe(2);
    expect(stats.totalReps).toBe(12);
  });

  it('avgRpe равен null, если RPE нигде не задан', () => {
    const stats = aggregateClientStats([workout({ rpe: null })]);
    expect(stats.avgRpe).toBeNull();
  });
});

describe('workoutRowStats', () => {
  it('считает тоннаж и выполненные подходы одной тренировки', () => {
    const w = workout({
      exercises: [
        {
          position: 0,
          exerciseId: 'e',
          exerciseName: 'Тяга',
          sets: [
            set({ done: true, actualWeightKg: 60, actualReps: 10 }), // 600
            set({ done: true, actualWeightKg: 60, actualReps: 10 }), // 600
            set({ done: false, actualWeightKg: 60, actualReps: 10 }),
          ],
        },
      ],
    });
    expect(workoutRowStats(w)).toEqual({ tonnageKg: 1200, doneSets: 2 });
  });
});

describe('aggregateExerciseOverview', () => {
  it('агрегирует PR по весу, тоннаж и дату последней сессии; рекорд в последней', () => {
    const list: WorkoutResponse[] = [
      workout({
        id: 'old',
        completedAt: '2026-04-01T10:00:00.000Z',
        exercises: [
          {
            position: 0,
            exerciseId: 'e1',
            exerciseName: 'Жим',
            sets: [set({ done: true, actualWeightKg: 50, actualReps: 10 })], // 500
          },
        ],
      }),
      workout({
        id: 'new',
        completedAt: '2026-05-01T10:00:00.000Z',
        exercises: [
          {
            position: 0,
            exerciseId: 'e1',
            exerciseName: 'Жим',
            sets: [set({ done: true, actualWeightKg: 60, actualReps: 8 })], // 480, PR=60
          },
        ],
      }),
    ];
    const ex = aggregateExerciseOverview(list)[0]!;
    expect(ex.exerciseId).toBe('e1');
    expect(ex.isTimeBased).toBe(false);
    expect(ex.maxWeightKg).toBe(60);
    expect(ex.tonnageKg).toBe(980);
    expect(ex.lastDate).toBe('2026-05-01T10:00:00.000Z');
    expect(ex.lastIsRecord).toBe(true);
  });

  it('lastIsRecord=false, если PR был в более ранней сессии', () => {
    const list: WorkoutResponse[] = [
      workout({
        id: 'a',
        completedAt: '2026-04-01T10:00:00.000Z',
        exercises: [
          {
            position: 0,
            exerciseId: 'e1',
            exerciseName: 'Жим',
            sets: [set({ done: true, actualWeightKg: 80, actualReps: 5 })],
          },
        ],
      }),
      workout({
        id: 'b',
        completedAt: '2026-05-01T10:00:00.000Z',
        exercises: [
          {
            position: 0,
            exerciseId: 'e1',
            exerciseName: 'Жим',
            sets: [set({ done: true, actualWeightKg: 70, actualReps: 6 })],
          },
        ],
      }),
    ];
    const ex = aggregateExerciseOverview(list)[0]!;
    expect(ex.maxWeightKg).toBe(80);
    expect(ex.lastIsRecord).toBe(false);
  });

  it('определяет упражнение «на время» и считает maxTimeSec/totalTimeSec', () => {
    const list: WorkoutResponse[] = [
      workout({
        completedAt: '2026-05-01T10:00:00.000Z',
        exercises: [
          {
            position: 0,
            exerciseId: 'plank',
            exerciseName: 'Планка',
            sets: [set({ done: true, actualTimeSec: 60 }), set({ done: true, actualTimeSec: 90 })],
          },
        ],
      }),
    ];
    const ex = aggregateExerciseOverview(list)[0]!;
    expect(ex.isTimeBased).toBe(true);
    expect(ex.maxTimeSec).toBe(90);
    expect(ex.totalTimeSec).toBe(150);
    expect(ex.maxWeightKg).toBeNull();
    expect(ex.lastIsRecord).toBe(true);
  });

  it('игнорирует незавершённые тренировки', () => {
    const list: WorkoutResponse[] = [
      workout({
        status: 'active',
        exercises: [
          {
            position: 0,
            exerciseId: 'e1',
            exerciseName: 'Жим',
            sets: [set({ done: true, actualWeightKg: 100, actualReps: 1 })],
          },
        ],
      }),
    ];
    expect(aggregateExerciseOverview(list)).toEqual([]);
  });
});
