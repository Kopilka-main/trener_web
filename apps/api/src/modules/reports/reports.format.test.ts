import { describe, it, expect } from 'vitest';
import { formatReport, num, type ReportData } from './reports.format.js';

const base: ReportData = {
  growth: {
    newTrainers: 3,
    newClientAccounts: 11,
    totalTrainers: 128,
    totalClientAccounts: 642,
    activeTrainers: 42,
    activeClients: 96,
    linkedPairs: 310,
  },
  business: {
    workoutsCompleted: 87,
    sessionsCreated: 120,
    measurements: 14,
    messages: 350,
    packages: 6,
    packagesSum: 42000,
  },
  health: {
    errors: 12,
    topErrors: [{ message: 'TypeError: undefined is not a function', count: 7 }],
    versions: [{ version: '1.5.0', platform: 'android', users: 38 }],
  },
  screens: [{ screen: 'Клиенты', minutes: 240, opens: 512 }],
};

describe('num', () => {
  it('разбивает разряды пробелами', () => {
    expect(num(42000)).toBe('42 000');
    expect(num(1234567)).toBe('1 234 567');
    expect(num(999)).toBe('999');
    expect(num(0)).toBe('0');
  });
});

describe('formatReport', () => {
  it('включает все четыре блока и заголовок', () => {
    const t = formatReport('Отчёт за 21 июля', base);
    expect(t).toContain('Отчёт за 21 июля');
    expect(t).toContain('РОСТ');
    expect(t).toContain('ДЕЙСТВИЯ');
    expect(t).toContain('ЗДОРОВЬЕ');
    expect(t).toContain('ЭКРАНЫ');
    expect(t).toContain('42 000 ₽');
  });

  it('без прошлого периода дельту не показывает (нечего сравнивать)', () => {
    const t = formatReport('за вчера', base);
    expect(t).toContain('Новые тренеры: 3 · всего 128');
    expect(t).not.toContain('(+');
  });

  it('с прошлым периодом показывает рост, падение и равенство', () => {
    const prev: ReportData = {
      ...base,
      growth: { ...base.growth, newTrainers: 1 },
      business: { ...base.business, workoutsCompleted: 90 },
      health: { ...base.health, errors: 12 },
    };
    const t = formatReport('за вчера', base, prev);
    expect(t).toContain('Новые тренеры: 3 (+2)');
    expect(t).toContain('Проведено тренировок: 87 (−3)');
    expect(t).toContain('Ошибок: 12 (=)');
  });

  it('обрезает длинный текст ошибки', () => {
    const long = 'x'.repeat(200);
    const t = formatReport('за вчера', {
      ...base,
      health: { ...base.health, topErrors: [{ message: long, count: 1 }] },
    });
    expect(t).toContain('…');
    expect(t).not.toContain('x'.repeat(100));
  });

  it('пустые экраны не ломают отчёт', () => {
    const t = formatReport('за вчера', { ...base, screens: [] });
    expect(t).toContain('ЭКРАНЫ');
    expect(t).toContain('нет данных');
  });
});
