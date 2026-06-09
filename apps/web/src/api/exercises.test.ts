import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseResponse } from '@trener/shared';
import { apiFetch } from './client';
import {
  listExercises,
  getExercise,
  createExercise,
  updateExercise,
  deleteExercise,
} from './exercises';

vi.mock('./client', () => ({ apiFetch: vi.fn() }));

const mockFetch = vi.mocked(apiFetch);

const sample: ExerciseResponse = {
  id: 'ex1',
  isGlobal: false,
  name: 'Присед',
  category: 'Ноги',
  subgroup: null,
  description: null,
  defaultReps: 10,
  defaultWeightKg: null,
  defaultTimeSec: null,
  restSec: 90,
  note: null,
  imageUrl: null,
  thumbUrl: null,
  videoUrl: null,
  equipment: null,
  primaryMuscles: null,
  secondaryMuscles: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('exercises api', () => {
  it('listExercises разворачивает {exercises}', async () => {
    mockFetch.mockResolvedValueOnce({ exercises: [sample] });
    await expect(listExercises()).resolves.toEqual([sample]);
    expect(mockFetch).toHaveBeenCalledWith('/exercises', expect.objectContaining({}));
  });

  it('getExercise разворачивает {exercise}', async () => {
    mockFetch.mockResolvedValueOnce({ exercise: sample });
    await expect(getExercise('ex1')).resolves.toEqual(sample);
    expect(mockFetch).toHaveBeenCalledWith('/exercises/ex1', expect.objectContaining({}));
  });

  it('createExercise делает POST и разворачивает результат', async () => {
    mockFetch.mockResolvedValueOnce({ exercise: sample });
    await expect(
      createExercise({ name: 'Присед', category: 'Ноги', restSec: 90 }),
    ).resolves.toEqual(sample);
    expect(mockFetch).toHaveBeenCalledWith(
      '/exercises',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('updateExercise делает PATCH по id', async () => {
    mockFetch.mockResolvedValueOnce({ exercise: sample });
    await expect(updateExercise('ex1', { name: 'Жим' })).resolves.toEqual(sample);
    expect(mockFetch).toHaveBeenCalledWith(
      '/exercises/ex1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('deleteExercise делает DELETE по id', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await expect(deleteExercise('ex1')).resolves.toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      '/exercises/ex1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
