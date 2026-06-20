import { describe, it, expect } from 'vitest';
import { buildClientNotifications } from './notifications';
import type { PackageResponse, SessionResponse, WorkoutResponse } from '@trener/shared';

function workout(over: Partial<WorkoutResponse>): WorkoutResponse {
  return {
    id: 'w1',
    clientId: 'c1',
    name: 'Push — грудь',
    status: 'draft',
    startedAt: null,
    completedAt: null,
    durationSec: null,
    trainerNote: null,
    rpe: null,
    createdByClient: false,
    excludedFromBalance: false,
    exercises: [],
    ...over,
  };
}

function session(over: Partial<SessionResponse>): SessionResponse {
  return {
    id: 's1',
    clientId: 'c1',
    workoutId: null,
    date: '2026-06-10',
    startTime: '10:00',
    durationMin: 60,
    location: null,
    title: null,
    status: 'planned',
    isOnline: false,
    note: null,
    clientConfirmation: 'confirmed',
    ...over,
  };
}

const NOW = new Date('2026-06-10T08:00:00');

describe('buildClientNotifications', () => {
  it('pending будущее занятие → confirm', () => {
    const r = buildClientNotifications({
      sessions: [session({ id: 's1', clientConfirmation: 'pending', date: '2026-06-11' })],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(r.map((n) => n.kind)).toEqual(['confirm']);
    expect(r[0]?.id).toBe('confirm:s1');
    expect(r[0]?.to).toBe('/calendar');
  });

  it('confirmed занятие в пределах 24ч → soon', () => {
    const r = buildClientNotifications({
      sessions: [
        session({
          id: 's2',
          clientConfirmation: 'confirmed',
          date: '2026-06-10',
          startTime: '20:00',
        }),
      ],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(r.map((n) => n.kind)).toEqual(['soon']);
    expect(r[0]?.id).toBe('soon:s2');
  });

  it('unread > 0 → chat; 0 → нет', () => {
    const withChat = buildClientNotifications({
      sessions: [],
      unread: 2,
      now: NOW,
      dismissed: new Set(),
    });
    expect(withChat.map((n) => n.kind)).toEqual(['chat']);
    expect(withChat[0]?.id).toBe('chat');
    const none = buildClientNotifications({
      sessions: [],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(none).toEqual([]);
  });

  it('прошедшие и cancelled игнорируются', () => {
    const r = buildClientNotifications({
      sessions: [
        session({ id: 'past', clientConfirmation: 'pending', date: '2026-06-09' }),
        session({
          id: 'canc',
          clientConfirmation: 'pending',
          status: 'cancelled',
          date: '2026-06-12',
        }),
      ],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(r).toEqual([]);
  });

  it('проведённое pending занятие (в окне 30 дней) → confirm', () => {
    const r = buildClientNotifications({
      sessions: [
        session({
          id: 'done1',
          status: 'completed',
          clientConfirmation: 'pending',
          date: '2026-06-09',
        }),
      ],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(r.map((n) => n.kind)).toEqual(['confirm']);
    expect(r[0]?.id).toBe('confirm:done1');
    expect(r[0]?.text).toContain('проведённую');
  });

  it('проведённое занятие: согласованное или старше 30 дней → нет confirm', () => {
    const r = buildClientNotifications({
      sessions: [
        session({
          id: 'ok',
          status: 'completed',
          clientConfirmation: 'confirmed',
          date: '2026-06-09',
        }),
        session({
          id: 'old',
          status: 'completed',
          clientConfirmation: 'pending',
          date: '2026-04-01',
        }),
      ],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(r).toEqual([]);
  });

  it('dismissed-id исключается; порядок confirm → soon → chat', () => {
    const sessions = [
      session({ id: 'p', clientConfirmation: 'pending', date: '2026-06-11' }),
      session({ id: 's', clientConfirmation: 'confirmed', date: '2026-06-10', startTime: '20:00' }),
    ];
    const all = buildClientNotifications({ sessions, unread: 1, now: NOW, dismissed: new Set() });
    expect(all.map((n) => n.kind)).toEqual(['confirm', 'soon', 'chat']);
    const filtered = buildClientNotifications({
      sessions,
      unread: 1,
      now: NOW,
      dismissed: new Set(['confirm:p']),
    });
    expect(filtered.map((n) => n.kind)).toEqual(['soon', 'chat']);
  });

  it('активный пакет с малым остатком → package; большой остаток/закрытый → нет', () => {
    const pkg = (over: Partial<PackageResponse>): PackageResponse => ({
      id: 'pk1',
      clientId: 'c1',
      kind: 'package',
      lessonsPaid: 10,
      lessonsUsed: 9,
      pricePerLesson: 1000,
      totalPaid: 10000,
      workoutType: null,
      paidAt: '2026-05-01',
      startsAt: '2026-05-01',
      endsAt: null,
      status: 'active',
      note: null,
      tags: [],
      createdAt: '2026-05-01T00:00:00.000Z',
      ...over,
    });
    const low = buildClientNotifications({
      sessions: [],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
      packages: [pkg({ id: 'pk1', lessonsUsed: 9 })], // остаток 1
    });
    expect(low.map((n) => n.kind)).toEqual(['package']);
    expect(low[0]?.id).toBe('package:pk1');
    expect(low[0]?.text).toContain('осталось 1');

    const ok = buildClientNotifications({
      sessions: [],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
      packages: [pkg({ lessonsUsed: 3 }), pkg({ id: 'closed', lessonsUsed: 10, status: 'closed' })], // остаток 7 / закрытый
    });
    expect(ok).toEqual([]);

    const ended = buildClientNotifications({
      sessions: [],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
      packages: [pkg({ id: 'pk2', lessonsUsed: 10, workoutType: 'Массаж' })], // остаток 0
    });
    expect(ended[0]?.kind).toBe('package');
    expect(ended[0]?.text).toContain('Массаж');
    expect(ended[0]?.text).toContain('закончился');
  });

  it('назначенная тренером тренировка (черновик, не своя) → workout', () => {
    const r = buildClientNotifications({
      sessions: [],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
      workouts: [workout({ id: 'w1', name: 'Pull', createdByClient: false, status: 'draft' })],
    });
    const wn = r.find((n) => n.kind === 'workout');
    expect(wn?.id).toBe('workout:w1');
    expect(wn?.text).toContain('Pull');
    expect(wn?.to).toBe('/workouts');
  });

  it('своя или завершённая/активная тренировка не даёт workout-уведомления', () => {
    const r = buildClientNotifications({
      sessions: [],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
      workouts: [
        workout({ id: 'own', createdByClient: true, status: 'draft' }),
        workout({ id: 'done', createdByClient: false, status: 'completed' }),
        workout({ id: 'act', createdByClient: false, status: 'active' }),
      ],
    });
    expect(r.some((n) => n.kind === 'workout')).toBe(false);
  });
});
