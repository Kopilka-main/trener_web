import { describe, it, expect } from 'vitest';
import { buildClientNotifications } from './notifications';
import type { PackageResponse, SessionResponse } from '@trener/shared';

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
      lessonsPaid: 10,
      lessonsUsed: 9,
      pricePerLesson: 1000,
      totalPaid: 10000,
      workoutType: null,
      startsAt: '2026-05-01',
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
});
