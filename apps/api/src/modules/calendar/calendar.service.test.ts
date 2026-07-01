import { describe, it, expect, vi } from 'vitest';
import type { Clock } from '../../core/app-deps.js';
import type { CalendarRepo, FeedSessionRow } from './calendar.repo.js';
import { makeCalendarService } from './calendar.service.js';

function feedRow(over: Partial<FeedSessionRow> = {}): FeedSessionRow {
  return {
    id: 's1',
    date: '2026-07-01',
    startTime: '09:00',
    durationMin: 60,
    title: null,
    location: null,
    isOnline: 0,
    clientName: null,
    status: 'planned',
    ...over,
  };
}

const clock: Clock = {
  newId: () => 'id',
  now: () => new Date('2026-07-01T12:00:00Z'),
};

function fakeRepo(over: Partial<CalendarRepo> = {}): CalendarRepo {
  return {
    getTrainerIdByToken: vi.fn(() => Promise.resolve(null)),
    getOrCreateToken: vi.fn(() => Promise.resolve('tok123')),
    listSessionsForFeed: vi.fn(() => Promise.resolve([])),
    ...over,
  };
}

describe('calendar.service', () => {
  it('buildIcs формирует VCALENDAR с VEVENT для занятия', async () => {
    const svc = makeCalendarService(
      fakeRepo({
        listSessionsForFeed: vi.fn(() =>
          Promise.resolve([
            feedRow({
              title: 'Ноги, спина',
              location: 'Зал 1',
              startTime: '09:00',
              durationMin: 90,
            }),
          ]),
        ),
      }),
      clock,
    );
    const ics = await svc.buildIcs('A');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//FitBond//Calendar//RU');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:s1@fitbond.ru');
    expect(ics).toContain('DTSTAMP:20260701T120000Z');
    // Floating local time (без Z/TZID).
    expect(ics).toContain('DTSTART:20260701T090000');
    expect(ics).toContain('DTEND:20260701T103000'); // +90 мин
    // Запятая в SUMMARY экранирована.
    expect(ics).toContain('SUMMARY:Ноги\\, спина');
    expect(ics).toContain('LOCATION:Зал 1');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('END:VEVENT');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    // Строки разделены CRLF.
    expect(ics).toContain('\r\n');
  });

  it('DTEND переносится через границу суток', async () => {
    const svc = makeCalendarService(
      fakeRepo({
        listSessionsForFeed: vi.fn(() =>
          Promise.resolve([feedRow({ startTime: '23:30', durationMin: 60 })]),
        ),
      }),
      clock,
    );
    const ics = await svc.buildIcs('A');
    expect(ics).toContain('DTSTART:20260701T233000');
    expect(ics).toContain('DTEND:20260702T003000');
  });

  it('онлайн-занятие → LOCATION:Онлайн; SUMMARY падает на имя клиента', async () => {
    const svc = makeCalendarService(
      fakeRepo({
        listSessionsForFeed: vi.fn(() =>
          Promise.resolve([feedRow({ isOnline: 1, location: null, clientName: 'Иван Петров' })]),
        ),
      }),
      clock,
    );
    const ics = await svc.buildIcs('A');
    expect(ics).toContain('SUMMARY:Иван Петров');
    expect(ics).toContain('LOCATION:Онлайн');
  });

  it('пустой список → валидный VCALENDAR без VEVENT', async () => {
    const svc = makeCalendarService(fakeRepo(), clock);
    const ics = await svc.buildIcs('A');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('нет title/клиента → SUMMARY:Занятие; пустой LOCATION опущен', async () => {
    const svc = makeCalendarService(
      fakeRepo({ listSessionsForFeed: vi.fn(() => Promise.resolve([feedRow()])) }),
      clock,
    );
    const ics = await svc.buildIcs('A');
    expect(ics).toContain('SUMMARY:Занятие');
    expect(ics).not.toContain('LOCATION:');
  });

  it('buildIcsForToken(unknown) → null', async () => {
    const svc = makeCalendarService(
      fakeRepo({ getTrainerIdByToken: vi.fn(() => Promise.resolve(null)) }),
      clock,
    );
    expect(await svc.buildIcsForToken('nope')).toBeNull();
  });

  it('buildIcsForToken(known) → строит фид для тренера токена', async () => {
    const listSessionsForFeed = vi.fn(() => Promise.resolve([feedRow()]));
    const svc = makeCalendarService(
      fakeRepo({
        getTrainerIdByToken: vi.fn(() => Promise.resolve('trainer-A')),
        listSessionsForFeed,
      }),
      clock,
    );
    const ics = await svc.buildIcsForToken('tok123');
    expect(ics).not.toBeNull();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(listSessionsForFeed).toHaveBeenCalledWith('trainer-A');
  });

  it('getFeedUrl возвращает ссылку с токеном', async () => {
    const getOrCreateToken = vi.fn(() => Promise.resolve('secret-tok'));
    const svc = makeCalendarService(fakeRepo({ getOrCreateToken }), clock);
    const url = await svc.getFeedUrl('A', 'app.fitbond.ru');
    expect(url).toBe('https://app.fitbond.ru/api/calendar/secret-tok.ics');
    expect(getOrCreateToken).toHaveBeenCalledWith('A');
  });
});
