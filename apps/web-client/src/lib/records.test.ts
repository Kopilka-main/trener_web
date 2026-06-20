import { describe, it, expect } from 'vitest';
import type { WorkoutResponse } from '@trener/shared';
import { computeRecordKeys, setKey } from './records';

function wk(id: string, sets: { w: number | null; r: number | null }[]): WorkoutResponse {
  return {
    id,
    clientId: 'c1',
    name: 'W',
    status: 'completed',
    startedAt: null,
    completedAt: null,
    durationSec: null,
    trainerNote: null,
    rpe: null,
    createdByClient: false,
    excludedFromBalance: false,
    exercises: [
      {
        position: 0,
        exerciseId: 'ex1',
        exerciseName: 'Жим',
        sets: sets.map((s, i) => ({
          setIndex: i,
          plannedReps: null,
          plannedWeightKg: null,
          plannedTimeSec: null,
          plannedRestSec: null,
          actualReps: s.r,
          actualWeightKg: s.w,
          actualTimeSec: null,
          done: true,
        })),
      },
    ],
  };
}

describe('computeRecordKeys', () => {
  it('помечает подход с максимальным весом по упражнению', () => {
    const keys = computeRecordKeys([wk('w1', [{ w: 50, r: 10 }]), wk('w2', [{ w: 60, r: 8 }])]);
    expect(keys.has(setKey('w2', 0, 0))).toBe(true);
    expect(keys.has(setKey('w1', 0, 0))).toBe(false);
  });

  it('при равном весе рекорд — больший по повторам', () => {
    const keys = computeRecordKeys([
      wk('w1', [
        { w: 50, r: 10 },
        { w: 50, r: 12 },
      ]),
    ]);
    expect(keys.has(setKey('w1', 0, 1))).toBe(true);
    expect(keys.has(setKey('w1', 0, 0))).toBe(false);
  });

  it('подходы без факта не дают рекорда', () => {
    const keys = computeRecordKeys([wk('w1', [{ w: null, r: null }])]);
    expect(keys.size).toBe(0);
  });
});
