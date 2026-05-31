import { describe, it, expect } from 'vitest';
import {
  templateExerciseSchema,
  createTemplateRequestSchema,
  updateTemplateRequestSchema,
} from './workout-templates.js';

describe('workout-templates schemas', () => {
  it('templateExercise: restSec по умолчанию 90', () => {
    const r = templateExerciseSchema.parse({ exerciseId: 'ex1', sets: 3 });
    expect(r.restSec).toBe(90);
    expect(r.exerciseId).toBe('ex1');
    expect(r.sets).toBe(3);
  });

  it('templateExercise: sets должно быть положительным', () => {
    expect(() => templateExerciseSchema.parse({ exerciseId: 'ex1', sets: 0 })).toThrow();
  });

  it('create тримит name и требует хотя бы одно упражнение', () => {
    const r = createTemplateRequestSchema.parse({
      name: '  День груди  ',
      categoryTag: '  push  ',
      exercises: [{ exerciseId: 'ex1', sets: 4 }],
    });
    expect(r.name).toBe('День груди');
    expect(r.categoryTag).toBe('push');
    expect(r.exercises).toHaveLength(1);
    expect(r.exercises[0]?.restSec).toBe(90);
  });

  it('create отклоняет пустое имя', () => {
    expect(() =>
      createTemplateRequestSchema.parse({ name: '', exercises: [{ exerciseId: 'ex1', sets: 1 }] }),
    ).toThrow();
  });

  it('create отклоняет пустой список упражнений', () => {
    expect(() => createTemplateRequestSchema.parse({ name: 'X', exercises: [] })).toThrow();
  });

  it('update допускает частичные поля', () => {
    const r = updateTemplateRequestSchema.parse({ name: 'Новое имя' });
    expect(r.name).toBe('Новое имя');
    expect(r.exercises).toBeUndefined();
  });

  it('update с exercises заменяет весь список', () => {
    const r = updateTemplateRequestSchema.parse({
      exercises: [
        { exerciseId: 'ex1', sets: 3 },
        { exerciseId: 'ex2', sets: 4, reps: 8 },
      ],
    });
    expect(r.exercises).toHaveLength(2);
    expect(r.exercises?.[1]?.reps).toBe(8);
  });
});
