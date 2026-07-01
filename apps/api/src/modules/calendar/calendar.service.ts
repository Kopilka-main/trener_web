import type { Clock } from '../../core/app-deps.js';
import type { CalendarRepo, FeedSessionRow } from './calendar.repo.js';

// Экранирование текста для iCalendar (RFC 5545, 3.3.11 TEXT):
// обратный слэш, точка с запятой, запятая, перевод строки.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

// 'YYYY-MM-DD' + 'HH:MM' → floating local compact 'YYYYMMDDTHHMMSS' (без Z/TZID).
function localCompact(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(/:/g, '')}00`;
}

// start + durationMin в том же floating-local формате. Через UTC-арифметику Date,
// чтобы корректно переносить через границы часа/суток без сдвига часового пояса.
function localCompactEnd(date: string, time: string, durationMin: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const base = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  const end = new Date(base + durationMin * 60_000);
  const dd = `${String(end.getUTCFullYear())}${pad2(end.getUTCMonth() + 1)}${pad2(end.getUTCDate())}`;
  const tt = `${pad2(end.getUTCHours())}${pad2(end.getUTCMinutes())}${pad2(end.getUTCSeconds())}`;
  return `${dd}T${tt}`;
}

// Текущее время (из clock) как UTC compact для DTSTAMP: 'YYYYMMDDTHHMMSSZ'.
function utcStamp(now: Date): string {
  const dd = `${String(now.getUTCFullYear())}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`;
  const tt = `${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
  return `${dd}T${tt}Z`;
}

function buildEvent(s: FeedSessionRow, stamp: string): string[] {
  const summary = s.title ?? s.clientName ?? 'Занятие';
  const location = s.isOnline !== 0 ? 'Онлайн' : (s.location ?? '');
  const lines = [
    'BEGIN:VEVENT',
    `UID:${s.id}@fitbond.ru`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${localCompact(s.date, s.startTime)}`,
    `DTEND:${localCompactEnd(s.date, s.startTime, s.durationMin)}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  // Пустой LOCATION опускаем (RFC не требует).
  if (location.length > 0) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push('STATUS:CONFIRMED', 'END:VEVENT');
  return lines;
}

export function makeCalendarService(repo: CalendarRepo, clock: Clock) {
  async function buildIcs(trainerId: string): Promise<string> {
    const rows = await repo.listSessionsForFeed(trainerId);
    const stamp = utcStamp(clock.now());
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FitBond//Calendar//RU',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:FitBond — расписание',
    ];
    for (const s of rows) lines.push(...buildEvent(s, stamp));
    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
  }

  return {
    // Секретная ссылка на .ics-фид для текущего тренера (токен ленивый).
    async getFeedUrl(trainerId: string, host: string): Promise<string> {
      const token = await repo.getOrCreateToken(trainerId);
      return `https://${host}/api/calendar/${token}.ics`;
    },

    buildIcs,

    // Публичный фид по токену: null → неизвестный токен (роут отвечает 404).
    async buildIcsForToken(token: string): Promise<string | null> {
      const trainerId = await repo.getTrainerIdByToken(token);
      if (trainerId === null) return null;
      return buildIcs(trainerId);
    },
  };
}

export type CalendarService = ReturnType<typeof makeCalendarService>;
