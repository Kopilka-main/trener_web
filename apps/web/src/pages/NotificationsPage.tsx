import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarOff,
  CalendarX2,
  Cake,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Wifi,
  X,
} from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToDelete } from '../components/HoldToDelete';
import { useClients } from '../api/clients';
import { useSessions } from '../api/sessions';
import { usePackageBalances } from '../api/packages';
import {
  buildNotifications,
  isoAddDays,
  loadDismissed,
  saveDismissed,
  saveSeen,
  type AlertType,
  type EventKind,
  type NotifAlert,
  type NotifEvent,
} from '../lib/notifications';

// ─── Страница ─────────────────────────────────────────────────────────────────

type Tab = 'events' | 'action';

export function NotificationsPage() {
  const clients = useClients();
  const sessions = useSessions(isoAddDays(-14), isoAddDays(30));
  const balances = usePackageBalances();
  const [tab, setTab] = useState<Tab>('events');
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  const paidClientIds = useMemo(
    () => new Set((balances.data ?? []).filter((b) => b.remaining > 0).map((b) => b.clientId)),
    [balances.data],
  );

  const { events, alerts } = useMemo(
    () => buildNotifications(clients.data ?? [], sessions.data ?? [], paidClientIds),
    [clients.data, sessions.data, paidClientIds],
  );

  // Заход на экран помечает текущие алерты просмотренными → счётчик на главной гаснет.
  useEffect(() => {
    if (!balances.isPending && !sessions.isPending && !clients.isPending) {
      saveSeen(new Set(alerts.map((a) => a.id)));
    }
  }, [alerts, balances.isPending, sessions.isPending, clients.isPending]);

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
    case 'confirmed':
      return { Icon: CalendarCheck, color: 'var(--color-accent)' };
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
  if (type === 'cancelled') return CalendarOff;
  if (type === 'declined') return CalendarX2;
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
