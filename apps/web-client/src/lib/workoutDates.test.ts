import { describe, it, expect } from 'vitest';
import { formatDateGroup, formatTime } from './workoutDates';

const now = new Date('2026-06-03T12:00:00Z');

describe('formatDateGroup', () => {
  it('сегодня', () => {
    expect(formatDateGroup('2026-06-03T08:30:00Z', now)).toBe('Сегодня');
  });
  it('вчера', () => {
    expect(formatDateGroup('2026-06-02T20:00:00Z', now)).toBe('Вчера');
  });
  it('иначе — день и месяц', () => {
    expect(formatDateGroup('2026-05-28T09:00:00Z', now)).toBe('28 мая');
  });
});

describe('formatTime', () => {
  it('часы:минуты', () => {
    expect(/^\d{2}:\d{2}$/.test(formatTime('2026-06-03T08:30:00Z'))).toBe(true);
  });
});
