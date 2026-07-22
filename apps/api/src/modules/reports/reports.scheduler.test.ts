import { describe, it, expect, vi } from 'vitest';
import { startReportsScheduler, dayLabel, startOfDay } from './reports.scheduler.js';
import type { ReportData } from './reports.format.js';

const empty: ReportData = {
  totals: [],
  growth: {
    newTrainers: 0,
    newClientAccounts: 0,
    activeTrainers: 0,
    activeClients: 0,
    linkedPairs: 0,
  },
  leaders: [],
  newTrainers: [],
  sync: [],
  audience: { platforms: [], avgSessionMin: 0 },
  business: {
    workoutsCompleted: 0,
    sessionsCreated: 0,
    measurements: 0,
    messages: 0,
    packages: 0,
    packagesSum: 0,
  },
  health: { errors: 0, topErrors: [], versions: [] },
  screens: [],
};

// Планировщик прогоняем вручную: подменяем таймеры, дергаем первый запуск.
function harness(now: Date) {
  const sent: string[] = [];
  const repo = { collect: vi.fn().mockResolvedValue(empty) };
  const stop = startReportsScheduler({
    repo,
    send: (t) => {
      sent.push(t);
      return Promise.resolve();
    },
    now: () => now,
    log: () => undefined,
  });
  return { sent, repo, stop };
}

describe('dayLabel / startOfDay', () => {
  it('дата по-русски', () => {
    expect(dayLabel(new Date(2026, 6, 21))).toBe('21 июля');
  });

  it('начало суток обнуляет время', () => {
    const d = startOfDay(new Date(2026, 6, 21, 15, 42, 7));
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(21);
  });
});

describe('startReportsScheduler', () => {
  it('до наступления часа отправки молчит', async () => {
    vi.useFakeTimers();
    const h = harness(new Date(2026, 6, 21, 7, 0)); // 07:00, порог 9
    await vi.advanceTimersByTimeAsync(61_000);
    expect(h.sent).toEqual([]);
    h.stop();
    vi.useRealTimers();
  });

  it('после часа отправки шлёт дневной отчёт ровно один раз', async () => {
    vi.useFakeTimers();
    const h = harness(new Date(2026, 6, 21, 10, 0)); // вторник
    await vi.advanceTimersByTimeAsync(61_000);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toContain('Отчёт за 20 июля');

    // Ещё несколько тиков в тот же день — повторов быть не должно.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(h.sent).toHaveLength(1);
    h.stop();
    vi.useRealTimers();
  });

  it('в понедельник добавляет недельный итог', async () => {
    vi.useFakeTimers();
    const h = harness(new Date(2026, 6, 20, 10, 0)); // понедельник
    await vi.advanceTimersByTimeAsync(61_000);
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1]).toContain('Недельный итог');
    h.stop();
    vi.useRealTimers();
  });

  it('падение сбора данных не роняет планировщик', async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const stop = startReportsScheduler({
      repo: { collect: vi.fn().mockRejectedValue(new Error('db down')) },
      send: () => Promise.resolve(),
      now: () => new Date(2026, 6, 21, 10, 0),
      log: (m) => errors.push(m),
    });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(errors).toContain('[reports] tick failed');
    stop();
    vi.useRealTimers();
  });
});
