import { describe, it, expect } from 'vitest';
import {
  workoutStatusSchema,
  createWorkoutRequestSchema,
  updateSetRequestSchema,
  completeWorkoutRequestSchema,
} from './client-workouts.js';

describe('client-workouts schemas', () => {
  it('workoutStatus принимает только допустимые значения', () => {
    expect(workoutStatusSchema.parse('draft')).toBe('draft');
    expect(workoutStatusSchema.parse('active')).toBe('active');
    expect(workoutStatusSchema.parse('completed')).toBe('completed');
    expect(workoutStatusSchema.parse('skipped')).toBe('skipped');
    expect(() => workoutStatusSchema.parse('paused')).toThrow();
  });

  it('create тримит name и принимает упражнения с подходами', () => {
    const r = createWorkoutRequestSchema.parse({
      name: '  Тренировка А  ',
      exercises: [{ exerciseId: 'ex1', sets: [{ plannedReps: 10, plannedWeightKg: 60 }] }],
    });
    expect(r.name).toBe('Тренировка А');
    expect(r.exercises).toHaveLength(1);
    expect(r.exercises[0]?.sets).toHaveLength(1);
    expect(r.exercises[0]?.sets[0]?.plannedReps).toBe(10);
  });

  it('create допускает sourceTemplateId', () => {
    const r = createWorkoutRequestSchema.parse({
      name: 'X',
      sourceTemplateId: 'tpl1',
      exercises: [{ exerciseId: 'ex1', sets: [{}] }],
    });
    expect(r.sourceTemplateId).toBe('tpl1');
  });

  it('create отклоняет пустое имя', () => {
    expect(() =>
      createWorkoutRequestSchema.parse({
        name: '',
        exercises: [{ exerciseId: 'ex1', sets: [{}] }],
      }),
    ).toThrow();
  });

  it('create допускает пустой список упражнений (пустая тренировка)', () => {
    const r = createWorkoutRequestSchema.parse({ name: 'X', exercises: [] });
    expect(r.exercises).toHaveLength(0);
  });

  it('create отклоняет упражнение без подходов', () => {
    expect(() =>
      createWorkoutRequestSchema.parse({ name: 'X', exercises: [{ exerciseId: 'ex1', sets: [] }] }),
    ).toThrow();
  });

  it('updateSet допускает частичные поля', () => {
    const r = updateSetRequestSchema.parse({ actualReps: 8, done: true });
    expect(r.actualReps).toBe(8);
    expect(r.done).toBe(true);
    expect(r.actualWeightKg).toBeUndefined();
  });

  it('complete принимает rpe в границах 1..10', () => {
    expect(completeWorkoutRequestSchema.parse({ rpe: 1 }).rpe).toBe(1);
    expect(completeWorkoutRequestSchema.parse({ rpe: 10 }).rpe).toBe(10);
  });

  it('complete отклоняет rpe вне границ 1..10', () => {
    expect(() => completeWorkoutRequestSchema.parse({ rpe: 0 })).toThrow();
    expect(() => completeWorkoutRequestSchema.parse({ rpe: 11 })).toThrow();
  });
});
