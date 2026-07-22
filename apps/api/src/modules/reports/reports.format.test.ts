import { describe, it, expect } from 'vitest';
import { formatReport, num, type ReportData } from './reports.format.js';

const base: ReportData = {
  totals: [
    { label: 'Тренеры', now: 62, was: 55 },
    { label: 'Занятия', now: 282, was: 161 },
  ],
  growth: {
    newTrainers: 3,
    newClientAccounts: 11,
    activeTrainers: 42,
    activeClients: 96,
    linkedPairs: 310,
  },
  leaders: [{ name: 'top@x.co', clients: 25 }],
  newTrainers: [{ name: 'vk_1@oauth.fitbond', via: 'vk' }],
  sync: [{ name: 'gym@x.co', linked: 11, total: 11 }],
  audience: {
    platforms: [
      { platform: 'ios', users: 84 },
      { platform: 'android', users: 16 },
    ],
    avgSessionMin: 3.0,
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
  it('включает все блоки и заголовок', () => {
    const t = formatReport('Отчёт за 21 июля', base);
    expect(t).toContain('Отчёт за 21 июля');
    expect(t).toContain('БАЗА');
    expect(t).toContain('Тренеры: 62 (+7)');
    expect(t).toContain('ЛИДЕРЫ');
    expect(t).toContain('top@x.co — 25');
    expect(t).toContain('вход через vk');
    expect(t).toContain('11/11');
    expect(t).toContain('ios 84%');
    expect(t).toContain('3.0 мин');
    expect(t).toContain('ЗА ПЕРИОД');
    expect(t).toContain('ЗДОРОВЬЕ');
    expect(t).toContain('ЭКРАНЫ');
    expect(t).toContain('42 000 ₽');
  });

  it('без прошлого периода не сравнивает метрики периода (сравнивать не с чем)', () => {
    const t = formatReport('за вчера', base);
    // Блок «БАЗА» сравнивает сам с собой (was→now), поэтому дельта там есть всегда.
    expect(t).toContain('Тренеры: 62 (+7)');
    // А метрики за период без prev идут голыми числами.
    expect(t).toContain('Новые тренеры: 3 · клиенты: 11');
    expect(t).toContain('Проведено тренировок: 87\n');
    expect(t).toContain('Ошибок: 12\n');
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
