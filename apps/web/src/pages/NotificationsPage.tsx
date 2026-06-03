import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Cake,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Wifi,
  X,
} from 'lucide-react';
import type { ClientResponse, SessionResponse } from '@trener/shared';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToDelete } from '../components/HoldToDelete';
import { useClients } from '../api/clients';
import { useSessions } from '../api/sessions';

const RU_MONTHS = [
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

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function isoAddDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fullName(c: ClientResponse): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

/** «3 июн, 14:30» / «3 июн» */
function labelDate(iso: string, time?: string): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  const base = `${String(d)} ${RU_MONTHS[m - 1] ?? ''}`;
  return time ? `${base}, ${time}` : base;
}

// ─── Модели уведомлений (вычисляются на клиенте) ──────────────────────────────

type EventKind = 'completed' | 'planned' | 'cancelled' | 'birthday';
interface NotifEvent {
  id: string;
  kind: EventKind;
  clientId: string | null;
  title: string;
  message: string;
  when: string;
  /** Метка времени для сортировки (мс). */
  ts: number;
}

type AlertType = 'no_upcoming' | 'online_today';
interface NotifAlert {
  id: string;
  type: AlertType;
  severity: 'danger' | 'warn';
  clientId: string | null;
  headline: string;
  clientName: string;
  message: string;
}

function buildNotifications(
  clients: ClientResponse[],
  sessions: SessionResponse[],
): { events: NotifEvent[]; alerts: NotifAlert[] } {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = isoAddDays(7);
  const ago14 = isoAddDays(-14);
  const in14 = isoAddDays(14);
  const nameById = new Map(clients.map((c) => [c.id, fullName(c)]));
  const tsOf = (iso: string, time: string) => Date.parse(`${iso}T${time || '00:00'}:00`);

  const events: NotifEvent[] = [];
  const alerts: NotifAlert[] = [];

  // События по сессиям.
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
      events.push({
        id: `ev:plan:${s.id}`,
        kind: 'planned',
        clientId: s.clientId,
        title: who,
        message: `Запланировано занятие${s.title ? ` · ${s.title}` : ''}`,
        when: labelDate(s.date, s.startTime),
        ts: tsOf(s.date, s.startTime),
      });
    } else if (s.status === 'cancelled' && s.date >= ago14 && s.date <= in14) {
      events.push({
        id: `ev:cancel:${s.id}`,
        kind: 'cancelled',
        clientId: s.clientId,
        title: who,
        message: 'Занятие отменено',
        when: labelDate(s.date, s.startTime),
        ts: tsOf(s.date, s.startTime),
      });
    }

    // Алерт: онлайн-тренировка сегодня.
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

  // Дни рождения сегодня (по клиентам).
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
        ts: Date.now() + 1, // вверху ленты
      });
    }
  }

  // Алерт: у клиента нет запланированных занятий на ближайшую неделю.
  const hasUpcoming = new Set(
    sessions
      .filter((s) => s.status === 'planned' && s.date >= today && s.date <= in7)
      .map((s) => s.clientId),
  );
  for (const c of clients) {
    if (!hasUpcoming.has(c.id)) {
      alerts.push({
        id: `al:noup:${c.id}`,
        type: 'no_upcoming',
        severity: 'warn',
        clientId: c.id,
        headline: 'Нет занятий на неделю',
        clientName: fullName(c),
        message: 'Не запланировано ни одного занятия на ближайшие 7 дней',
      });
    }
  }

  events.sort((a, b) => b.ts - a.ts);
  return { events, alerts };
}

// ─── Страница ─────────────────────────────────────────────────────────────────

type Tab = 'events' | 'action';

export function NotificationsPage() {
  const clients = useClients();
  const sessions = useSessions(isoAddDays(-14), isoAddDays(30));
  const [tab, setTab] = useState<Tab>('events');
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(dismissed)));
    } catch {
      /* приватный режим */
    }
  }, [dismissed]);

  const { events, alerts } = useMemo(
    () => buildNotifications(clients.data ?? [], sessions.data ?? []),
    [clients.data, sessions.data],
  );

  const visibleEvents = events.filter((e) => !dismissed.has(e.id));
  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));
  const loading = clients.isPending || sessions.isPending;

  function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
  }

  const visibleIds =
    tab === 'action' ? visibleAlerts.map((a) => a.id) : visibleEvents.map((e) => e.id);

  function clearAll() {
    setDismissed((prev) => {
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title="Уведомления"
        back="/"
        right={
          visibleIds.length > 0 ? (
            <HoldToDelete icon="trash" onDelete={clearAll} label="Удерживайте, чтобы очистить" />
          ) : undefined
        }
      />

      <div className="px-4 pt-1">
        <div className="flex gap-1 rounded-xl bg-chip p-1">
          <TabButton active={tab === 'events'} onClick={() => setTab('events')}>
            События
          </TabButton>
          <TabButton active={tab === 'action'} onClick={() => setTab('action')}>
            Требует действия
            {visibleAlerts.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {visibleAlerts.length}
              </span>
            )}
          </TabButton>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-4 pb-10 pt-3">
        {loading && <p className="py-6 text-center text-[13px] text-ink-muted">Загрузка…</p>}

        {!loading && tab === 'events' && (
          <>
            {visibleEvents.length === 0 ? (
              <Empty>Пока нет событий.</Empty>
            ) : (
              visibleEvents.map((e) => (
                <EventCard key={e.id} event={e} onDismiss={() => dismiss(e.id)} />
              ))
            )}
          </>
        )}

        {!loading && tab === 'action' && (
          <>
            {visibleAlerts.length === 0 ? (
              <Empty>Нет открытых задач — всё в порядке.</Empty>
            ) : (
              visibleAlerts.map((a) => (
                <AlertCard key={a.id} alert={a} onDismiss={() => dismiss(a.id)} />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
        active ? 'bg-card text-ink' : 'text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-6 text-center text-[13px] text-ink-muted">{children}</div>
  );
}

// ─── Карточки ─────────────────────────────────────────────────────────────────

function eventIcon(kind: EventKind): { Icon: typeof Cake; color: string } {
  switch (kind) {
    case 'birthday':
      return { Icon: Cake, color: 'var(--color-coral)' };
    case 'completed':
      return { Icon: CheckCircle2, color: 'var(--color-accent)' };
    case 'cancelled':
      return { Icon: X, color: 'var(--color-ink-mutedxl)' };
    default:
      return { Icon: CalendarPlus, color: 'var(--color-ink)' };
  }
}

function EventCard({ event, onDismiss }: { event: NotifEvent; onDismiss: () => void }) {
  const navigate = useNavigate();
  const { Icon, color } = eventIcon(event.kind);
  return (
    <div className="relative flex items-start gap-3 rounded-2xl bg-card p-3 pr-9">
      <DismissButton onClick={onDismiss} />
      <button
        type="button"
        onClick={() => event.clientId && void navigate(`/clients/${event.clientId}`)}
        disabled={!event.clientId}
        className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ color }}>
          <Icon size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 pr-4">
            <span className="truncate text-[14px] font-semibold text-ink">{event.title}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-ink-mutedxl">{event.when}</span>
          </div>
          <div className="mt-0.5 text-[13px] text-ink-muted">{event.message}</div>
        </div>
      </button>
    </div>
  );
}

function alertIcon(type: AlertType): typeof Wifi {
  if (type === 'online_today') return Wifi;
  if (type === 'no_upcoming') return Dumbbell;
  return AlertTriangle;
}

function AlertCard({ alert, onDismiss }: { alert: NotifAlert; onDismiss: () => void }) {
  const navigate = useNavigate();
  const color = alert.severity === 'danger' ? 'var(--color-danger)' : 'var(--color-amber)';
  const Icon = alertIcon(alert.type);
  return (
    <div className="relative flex items-start gap-3 rounded-2xl bg-card p-3 pr-9">
      <DismissButton onClick={onDismiss} />
      <button
        type="button"
        onClick={() => alert.clientId && void navigate(`/clients/${alert.clientId}`)}
        disabled={!alert.clientId}
        className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ color }}>
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5 pr-4">
          <div className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-ink-mutedxl">
            {alert.headline}
          </div>
          <div className="text-[14px] font-semibold text-ink">{alert.clientName}</div>
          <div className="text-[13px] text-ink-muted">{alert.message}</div>
          {alert.clientId && (
            <div className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-ink-muted">
              Открыть карточку <ChevronRight size={12} />
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Скрыть"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-ink-mutedxl active:bg-card-elevated"
    >
      <X size={14} />
    </button>
  );
}
