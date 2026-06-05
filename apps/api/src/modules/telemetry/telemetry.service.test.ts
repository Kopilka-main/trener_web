import { describe, it, expect, vi } from 'vitest';
import { makeTelemetryService } from './telemetry.service.js';
import type { TelemetryRepo, AnalyticsEventRow, ErrorLogRow } from './telemetry.repo.js';

function fakeRepo() {
  const events: AnalyticsEventRow[][] = [];
  const errors: ErrorLogRow[][] = [];
  const repo: TelemetryRepo = {
    insertEvents: vi.fn((rows: AnalyticsEventRow[]) => {
      events.push(rows);
      return Promise.resolve();
    }),
    insertErrors: vi.fn((rows: ErrorLogRow[]) => {
      errors.push(rows);
      return Promise.resolve();
    }),
  };
  return { repo, events, errors };
}

const deps = { newId: () => 'id1' };

describe('telemetry service', () => {
  it('атрибутирует актора и санитизирует props (только примитивы, кап ключей)', async () => {
    const { repo, events } = fakeRepo();
    const svc = makeTelemetryService(repo, deps);
    const big: Record<string, unknown> = { a: 'x', bad: { nested: 1 } };
    for (let i = 0; i < 30; i++) big[`k${String(i)}`] = i;
    const n = await svc.ingestEvents(
      { source: 'client', sessionId: 's1', events: [{ name: 'click', props: big }] },
      { actorType: 'client', actorId: 'ca1' },
      'UA',
    );
    expect(n).toBe(1);
    const row = events[0]![0]!;
    expect(row.actorType).toBe('client');
    expect(row.actorId).toBe('ca1');
    expect(Object.keys(row.props as object).length).toBeLessThanOrEqual(16);
    expect((row.props as Record<string, unknown>).bad).toBeUndefined();
  });

  it('recordApiError пишет одну строку source=api', async () => {
    const { repo, errors } = fakeRepo();
    const svc = makeTelemetryService(repo, deps);
    await svc.recordApiError({
      message: 'boom',
      actorType: 'anon',
      actorId: null,
      statusCode: 500,
      path: '/x',
      method: 'GET',
    });
    expect(errors[0]![0]!.source).toBe('api');
    expect(errors[0]![0]!.message).toBe('boom');
  });
});
