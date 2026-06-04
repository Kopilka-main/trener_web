import type { ClientResponse, SessionResponse } from '@trener/shared';

export const RU_MONTHS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

const DISMISSED_KEY = 'notifications_dismissed';

export function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveDismissed(set: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* приватный режим */
  }
}

// «Просмотренные» алерты — для счётчика на плитке главной. При заходе на
// /notifications помечаем текущие алерты просмотренными → бейдж на главной гаснет;
// новые (с новыми id) снова поднимут счётчик.
const SEEN_KEY = 'notifications_seen';

export function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveSeen(set: Set<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* приватный режим */
  }
}

export function isoAddDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fullName(c: ClientResponse): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

/** «3 июн, 14:30» / «3 июн» */
export function labelDate(iso: string, time?: string): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  const base = `${String(d)} ${RU_MONTHS[m - 1] ?? ''}`;
  return time ? `${base}, ${time}` : base;
}

export type EventKind = 'completed' | 'planned' | 'confirmed' | 'birthday';
export interface NotifEvent {
  id: string;
  kind: EventKind;
  clientId: string | null;
  title: string;
  message: string;
  when: string;
  /** Метка времени для сортировки (мс). */
  ts: number;
}

export type AlertType = 'no_upcoming' | 'online_today' | 'cancelled' | 'declined';
export interface NotifAlert {
  id: string;
  type: AlertType;
  severity: 'danger' | 'warn';
  clientId: string | null;
  headline: string;
  clientName: string;
  message: string;
}

/**
 * Считает уведомления тренера на клиенте из списков клиентов и занятий:
 *  • События — проведённые/запланированные занятия, дни рождения;
 *  • Требует действия — отменённые занятия, онлайн сегодня, клиенты без занятий на неделю.
 */
export function buildNotifications(
  clients: ClientResponse[],
  sessions: SessionResponse[],
  // Клиенты с положительным остатком оплаченных тренировок. Алерт «нет занятий
  // на неделю» шлём только им (оплатил, но не записан). undefined → не шлём вовсе.
  paidClientIds?: Set<string>,
): { events: NotifEvent[]; alerts: NotifAlert[] } {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = isoAddDays(7);
  const ago14 = isoAddDays(-14);
  const in14 = isoAddDays(14);
  const nameById = new Map(clients.map((c) => [c.id, fullName(c)]));
  const tsOf = (iso: string, time: string) => Date.parse(`${iso}T${time || '00:00'}:00`);

  const events: NotifEvent[] = [];
  const alerts: NotifAlert[] = [];

  for (const s of sessions) {
    const who = nameById.get(s.clientId) ?? 'Клиент';
    if (s.status === 'completed' && s.date >= ago14 && s.date <= today) {
      events.push({
        id: `ev:done:${s.id}`,
        kind: 'completed',
        clientId: s.clientId,
        title: who,
        message: `Проведено занятие${s.title ? ` · ${s.title}` : ''}`,
        when: labelDate(s.date, s.startTime),
        ts: tsOf(s.date, s.startTime),
      });
    } else if (s.status === 'planned' && s.date >= today && s.date <= in14) {
      if (s.clientConfirmation === 'confirmed') {
        events.push({
          id: `ev:confirm:${s.id}`,
          kind: 'confirmed',
          clientId: s.clientId,
          title: who,
          message: `Клиент подтвердил занятие${s.title ? ` · ${s.title}` : ''}`,
          when: labelDate(s.date, s.startTime),
          ts: tsOf(s.date, s.startTime),
        });
      } else {
        events.push({
          id: `ev:plan:${s.id}`,
          kind: 'planned',
          clientId: s.clientId,
          title: who,
          message: `Запланировано занятие${s.title ? ` · ${s.title}` : ''}`,
          when: labelDate(s.date, s.startTime),
          ts: tsOf(s.date, s.startTime),
        });
      }
    }

    // Отмена занятия → требует действия (переназначить/связаться).
    if (s.status === 'cancelled' && s.date >= ago14 && s.date <= in14) {
      alerts.push({
        id: `al:cancel:${s.id}`,
        type: 'cancelled',
        severity: 'danger',
        clientId: s.clientId,
        headline: 'Занятие отменено',
        clientName: who,
        message: `${labelDate(s.date, s.startTime)} — переназначьте или свяжитесь с клиентом`,
      });
    }

    // Клиент отклонил занятие → требует действия (согласовать другое время).
    if (
      s.status !== 'cancelled' &&
      s.clientConfirmation === 'declined' &&
      s.date >= ago14 &&
      s.date <= in14
    ) {
      alerts.push({
        id: `al:declined:${s.id}`,
        type: 'declined',
        severity: 'danger',
        clientId: s.clientId,
        headline: 'Клиент отклонил занятие',
        clientName: who,
        message: `${labelDate(s.date, s.startTime)} — согласуйте другое время`,
      });
    }

    // Онлайн-тренировка сегодня.
    if (s.status === 'planned' && s.isOnline && s.date === today) {
      alerts.push({
        id: `al:online:${s.id}`,
        type: 'online_today',
        severity: 'warn',
        clientId: s.clientId,
        headline: 'Онлайн-тренировка сегодня',
        clientName: who,
        message: `Сегодня в ${s.startTime}${s.title ? ` · ${s.title}` : ''}`,
      });
    }
  }

  // Дни рождения сегодня.
  const [, tm, td] = today.split('-').map(Number);
  for (const c of clients) {
    if (!c.birthDate) continue;
    const [, bm, bd] = c.birthDate.split('-').map(Number);
    if (bm === tm && bd === td) {
      events.push({
        id: `ev:bday:${c.id}`,
        kind: 'birthday',
        clientId: c.id,
        title: fullName(c),
        message: 'Сегодня день рождения 🎂',
        when: 'сегодня',
        ts: Date.now() + 1,
      });
    }
  }

  // Клиенты без запланированных занятий на ближайшую неделю.
  const hasUpcoming = new Set(
    sessions
      .filter((s) => s.status === 'planned' && s.date >= today && s.date <= in7)
      .map((s) => s.clientId),
  );
  for (const c of clients) {
    // Только если у клиента есть оплаченный остаток тренировок, но нет записи.
    if (paidClientIds?.has(c.id) && !hasUpcoming.has(c.id)) {
      alerts.push({
        id: `al:noup:${c.id}`,
        type: 'no_upcoming',
        severity: 'warn',
        clientId: c.id,
        headline: 'Нет занятий на неделю',
        clientName: fullName(c),
        message: 'Оплачены тренировки, но нет записи на ближайшие 7 дней',
      });
    }
  }

  events.sort((a, b) => b.ts - a.ts);
  return { events, alerts };
}
