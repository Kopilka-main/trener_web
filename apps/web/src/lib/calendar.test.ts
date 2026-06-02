import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  endTime,
  humanDuration,
  monthGrid,
  parseISO,
  sameDay,
  startOfWeek,
  timeToMin,
  toISODate,
  weekDates,
  weekdayMon,
} from './calendar';

describe('toISODate / parseISO', () => {
  it('round-trips a local date', () => {
    const d = new Date(2026, 5, 2); // 2 июня 2026
    expect(toISODate(d)).toBe('2026-06-02');
    expect(toISODate(parseISO('2026-06-02'))).toBe('2026-06-02');
  });
});

describe('weekdayMon', () => {
  it('returns 0 for Monday and 6 for Sunday', () => {
    expect(weekdayMon(new Date(2026, 5, 1))).toBe(0); // Пн 1 июня 2026
    expect(weekdayMon(new Date(2026, 5, 7))).toBe(6); // Вс 7 июня 2026
  });
});

describe('startOfWeek / weekDates', () => {
  it('weekDates starts on Monday and spans 7 days', () => {
    const week = weekDates(new Date(2026, 5, 3)); // среда
    expect(week).toHaveLength(7);
    const [mon, , , , , , sun] = week;
    if (!mon || !sun) throw new Error('week incomplete');
    expect(toISODate(mon)).toBe('2026-06-01'); // понедельник
    expect(toISODate(sun)).toBe('2026-06-07'); // воскресенье
    expect(weekdayMon(startOfWeek(new Date(2026, 5, 3)))).toBe(0);
  });
});

describe('monthGrid', () => {
  it('returns 42 cells starting on a Monday and covering the month', () => {
    const cells = monthGrid(new Date(2026, 5, 15)); // июнь 2026
    expect(cells).toHaveLength(42);
    const first = cells[0];
    if (!first) throw new Error('no cells');
    expect(weekdayMon(first)).toBe(0);
    expect(toISODate(first)).toBe('2026-06-01'); // 1 июня — понедельник
    expect(cells.some((d) => sameDay(d, new Date(2026, 5, 30)))).toBe(true);
  });
});

describe('addDays / addMonths', () => {
  it('shifts across month and year boundaries', () => {
    expect(toISODate(addDays(new Date(2026, 5, 30), 1))).toBe('2026-07-01');
    expect(toISODate(addMonths(new Date(2026, 11, 15), 1))).toBe('2027-01-15');
  });
});

describe('timeToMin / endTime', () => {
  it('converts and computes the end time', () => {
    expect(timeToMin('10:30')).toBe(630);
    expect(endTime('10:00', 45)).toBe('10:45');
    expect(endTime('23:30', 60)).toBe('00:30');
  });
});

describe('humanDuration', () => {
  it('formats minutes into ч/мин', () => {
    expect(humanDuration(45)).toBe('45 мин');
    expect(humanDuration(60)).toBe('1 ч');
    expect(humanDuration(105)).toBe('1 ч 45 мин');
  });
});
