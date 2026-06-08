import { describe, it, expect } from 'vitest';
import {
  packageStatusSchema,
  createPackageRequestSchema,
  updatePackageRequestSchema,
} from './packages.js';

describe('packages schemas', () => {
  it('packageStatus принимает только допустимые значения', () => {
    expect(packageStatusSchema.parse('active')).toBe('active');
    expect(packageStatusSchema.parse('closed')).toBe('closed');
    expect(packageStatusSchema.parse('cancelled')).toBe('cancelled');
    expect(() => packageStatusSchema.parse('paused')).toThrow();
  });

  it('create принимает валидные поля', () => {
    const r = createPackageRequestSchema.parse({
      lessonsPaid: 10,
      pricePerLesson: 1500,
      totalPaid: 15000,
      startsAt: '2026-06-01',
    });
    expect(r.lessonsPaid).toBe(10);
    expect(r.pricePerLesson).toBe(1500);
    expect(r.totalPaid).toBe(15000);
    expect(r.startsAt).toBe('2026-06-01');
  });

  it('create тримит workoutType/note', () => {
    const r = createPackageRequestSchema.parse({
      lessonsPaid: 5,
      pricePerLesson: 1000,
      totalPaid: 5000,
      startsAt: '2026-06-01',
      workoutType: '  Силовая  ',
      note: '  оплата наличными  ',
    });
    expect(r.workoutType).toBe('Силовая');
    expect(r.note).toBe('оплата наличными');
  });

  it('create отклоняет отрицательные числа и нулевой totalPaid', () => {
    // totalPaid должен быть > 0 (0 недопустим даже для абонемента).
    expect(() =>
      createPackageRequestSchema.parse({
        lessonsPaid: 5,
        pricePerLesson: 1000,
        totalPaid: 0,
        startsAt: '2026-06-01',
      }),
    ).toThrow();
    // Отрицательные lessonsPaid/pricePerLesson недопустимы (0 разрешён для абонемента).
    expect(() =>
      createPackageRequestSchema.parse({
        lessonsPaid: -1,
        pricePerLesson: 1000,
        totalPaid: 5000,
        startsAt: '2026-06-01',
      }),
    ).toThrow();
    expect(() =>
      createPackageRequestSchema.parse({
        lessonsPaid: 5,
        pricePerLesson: -1,
        totalPaid: 5000,
        startsAt: '2026-06-01',
      }),
    ).toThrow();
  });

  it('create отклоняет дробный lessonsPaid', () => {
    expect(() =>
      createPackageRequestSchema.parse({
        lessonsPaid: 1.5,
        pricePerLesson: 1000,
        totalPaid: 5000,
        startsAt: '2026-06-01',
      }),
    ).toThrow();
  });

  it('create отклоняет невалидный формат startsAt', () => {
    expect(() =>
      createPackageRequestSchema.parse({
        lessonsPaid: 5,
        pricePerLesson: 1000,
        totalPaid: 5000,
        startsAt: '01-06-2026',
      }),
    ).toThrow();
  });

  it('update допускает частичные поля и status', () => {
    const r = updatePackageRequestSchema.parse({ lessonsPaid: 8, status: 'closed' });
    expect(r.lessonsPaid).toBe(8);
    expect(r.status).toBe('closed');
    expect(r.totalPaid).toBeUndefined();
  });

  it('update отклоняет неизвестный статус', () => {
    expect(() => updatePackageRequestSchema.parse({ status: 'paused' })).toThrow();
  });
});
