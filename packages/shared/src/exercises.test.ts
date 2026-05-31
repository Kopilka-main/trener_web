import { describe, it, expect } from 'vitest';
import { createExerciseRequestSchema, updateExerciseRequestSchema } from './exercises.js';

describe('exercises schemas', () => {
  it('create тримит name и category', () => {
    const r = createExerciseRequestSchema.parse({
      name: '  Приседания  ',
      category: '  Ноги  ',
    });
    expect(r.name).toBe('Приседания');
    expect(r.category).toBe('Ноги');
    expect(r.restSec).toBe(90); // default
  });

  it('create отклоняет пустое имя', () => {
    expect(() => createExerciseRequestSchema.parse({ name: '', category: 'X' })).toThrow();
  });

  it('update допускает частичные поля', () => {
    const r = updateExerciseRequestSchema.parse({ defaultReps: 12 });
    expect(r.defaultReps).toBe(12);
    expect(r.name).toBeUndefined();
  });

  it('отбрасывает неизвестные поля', () => {
    const r = createExerciseRequestSchema.parse({
      name: 'A',
      category: 'B',
      bogus: 1,
    }) as Record<string, unknown>;
    expect(r.bogus).toBeUndefined();
  });
});
