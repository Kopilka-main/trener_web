import type { SessionResponse } from '@trener/shared';
import { MONTH_GEN, parseISO } from './calendar';

export type ClientNotificationKind = 'confirm' | 'soon' | 'chat';

export interface ClientNotification {
  id: string;
  kind: ClientNotificationKind;
  text: string;
  to: string;
}

const DISMISSED_KEY = 'client_notifications_dismissed';

/** Отброшенные уведомления из localStorage (битый JSON → пусто). */
export function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Добавить id в отброшенные, сохранить, вернуть новый набор. */
export function dismissNotification(id: string): Set<string> {
  const next = loadDismissed();
  next.add(id);
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
  } catch {
    // localStorage недоступен — молча игнорируем.
  }
  return next;
}

function startMs(s: SessionResponse): number {
  const d = parseISO(s.date);
  const [h, m] = s.startTime.split(':').map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

function whenLabel(s: SessionResponse): string {
  const d = parseISO(s.date);
  return `${String(d.getDate())} ${MONTH_GEN[d.getMonth()] ?? ''}, ${s.startTime}`;
}

/** Уведомления клиента из доступных данных. Чистая функция (без localStorage). */
export function buildClientNotifications(args: {
  sessions: SessionResponse[];
  unread: number;
  now: Date;
  dismissed: Set<string>;
}): ClientNotification[] {
  const { sessions, unread, now, dismissed } = args;
  const nowMs = now.getTime();
  const out: ClientNotification[] = [];

  const future = sessions
    .filter((s) => s.status !== 'cancelled' && startMs(s) >= nowMs)
    .sort((a, b) => startMs(a) - startMs(b));

  // 1) Подтверждения (каждое pending-занятие).
  for (const s of future) {
    if (s.clientConfirmation === 'pending') {
      out.push({
        id: `confirm:${s.id}`,
        kind: 'confirm',
        text: `Подтвердите занятие ${whenLabel(s)}`,
        to: '/calendar',
      });
    }
  }

  // 2) Скоро занятие — ближайшее НЕ pending в пределах 24ч.
  const soon = future.find(
    (s) => s.clientConfirmation !== 'pending' && startMs(s) - nowMs <= 24 * 3600 * 1000,
  );
  if (soon) {
    out.push({
      id: `soon:${soon.id}`,
      kind: 'soon',
      text: `Скоро занятие: ${whenLabel(soon)}`,
      to: '/calendar',
    });
  }

  // 3) Новые сообщения.
  if (unread > 0) {
    out.push({
      id: 'chat',
      kind: 'chat',
      text: `Новые сообщения от тренера (${String(unread)})`,
      to: '/chat',
    });
  }

  return out.filter((n) => !dismissed.has(n.id));
}
