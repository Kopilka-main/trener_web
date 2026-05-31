import { describe, it, expect } from 'vitest';
import {
  sessionStatusSchema,
  createSessionRequestSchema,
  updateSessionRequestSchema,
} from './sessions.js';

describe('sessions schemas', () => {
  it('sessionStatus принимает только допустимые значения', () => {
    expect(sessionStatusSchema.parse('planned')).toBe('planned');
    expect(sessionStatusSchema.parse('completed')).toBe('completed');
    expect(sessionStatusSchema.parse('cancelled')).toBe('cancelled');
    expect(() => sessionStatusSchema.parse('paused')).toThrow();
  });

  it('create принимает валидные date/startTime и проставляет дефолты', () => {
    const r = createSessionRequestSchema.parse({
      clientId: 'c1',
      date: '2026-06-01',
      startTime: '09:30',
    });
    expect(r.clientId).toBe('c1');
    expect(r.date).toBe('2026-06-01');
    expect(r.startTime).toBe('09:30');
    expect(r.durationMin).toBe(60); // default
    expect(r.isOnline).toBe(false); // default
  });

  it('create тримит location/title и допускает workoutId', () => {
    const r = createSessionRequestSchema.parse({
      clientId: 'c1',
      date: '2026-06-01',
      startTime: '09:30',
      location: '  Зал 1  ',
      title: '  Утро  ',
      workoutId: 'w1',
      isOnline: true,
      durationMin: 45,
    });
    expect(r.location).toBe('Зал 1');
    expect(r.title).toBe('Утро');
    expect(r.workoutId).toBe('w1');
    expect(r.isOnline).toBe(true);
    expect(r.durationMin).toBe(45);
  });

  it('create отклоняет невалидный формат date', () => {
    expect(() =>
      createSessionRequestSchema.parse({ clientId: 'c1', date: '01-06-2026', startTime: '09:30' }),
    ).toThrow();
  });

  it('create отклоняет невалидный формат startTime', () => {
    expect(() =>
      createSessionRequestSchema.parse({ clientId: 'c1', date: '2026-06-01', startTime: '9:30' }),
    ).toThrow();
  });

  it('create отклоняет пустой clientId', () => {
    expect(() =>
      createSessionRequestSchema.parse({ clientId: '', date: '2026-06-01', startTime: '09:30' }),
    ).toThrow();
  });

  it('update допускает частичные поля и status', () => {
    const r = updateSessionRequestSchema.parse({ startTime: '10:00', status: 'completed' });
    expect(r.startTime).toBe('10:00');
    expect(r.status).toBe('completed');
    expect(r.date).toBeUndefined();
  });

  it('update отклоняет неизвестный статус', () => {
    expect(() => updateSessionRequestSchema.parse({ status: 'paused' })).toThrow();
  });
});
