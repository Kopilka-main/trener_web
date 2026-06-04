import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  MessageSquare,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useClients } from '../api/clients';
import { useExercises } from '../api/exercises';
import { useSessions } from '../api/sessions';
import { useAccountingSummary } from '../api/accounting';
import { useChatUnread } from '../api/chat';

const DAY_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
const MONTH_FULL = [
  'ЯНВАРЯ',
  'ФЕВРАЛЯ',
  'МАРТА',
  'АПРЕЛЯ',
  'МАЯ',
  'ИЮНЯ',
  'ИЮЛЯ',
  'АВГУСТА',
  'СЕНТЯБРЯ',
  'ОКТЯБРЯ',
  'НОЯБРЯ',
  'ДЕКАБРЯ',
];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** «HH:MM» → минуты от полуночи. */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** Дата YYYY-MM-DD + время HH:MM → локальный Date. */
function toLocalDate(date: string, hhmm: string): Date {
  const [y, mo, d] = date.split('-');
  const [h, m] = hhmm.split(':');
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(m));
}

function diffShort(future: Date, now: Date): string {
  const ms = future.getTime() - now.getTime();
  if (ms <= 0) return 'СЕЙЧАС';
  const totalMin = Math.round(ms / 60000);
  const totalH = Math.floor(totalMin / 60);
  // Свыше суток — переключаемся на дни (и остаток в часах, если есть).
  if (totalH >= 24) {
    const d = Math.floor(totalH / 24);
    const h = totalH % 24;
    return h === 0 ? `${d}Д` : `${d}Д ${h}Ч`;
  }
  const m = totalMin % 60;
  if (totalH === 0) return `${m}М`;
  if (m === 0) return `${totalH}Ч`;
  return `${totalH}Ч ${m}М`;
}

type Metric = { v: string; s: string | string[] };
type TileKey = 'clients' | 'calendar' | 'chat' | 'exercises' | 'finance' | 'notifications';

export function HomePage() {
  const navigate = useNavigate();
  const { data: clients } = useClients();
  const { data: exercises } = useExercises();

  const now = new Date();
  const today = isoDate(now);
  const monthAhead = isoDate(new Date(now.getTime() + 30 * 86400000));
  const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));

  const { data: sessionsMonth } = useSessions(today, monthAhead);
  const { data: finance } = useAccountingSummary(monthStart, today);

  // Непрочитанные диалоги тренера (плитка «Сообщения» становится primary при > 0).
  const { data: chatUnread } = useChatUnread();
  const chatBadge = chatUnread ?? 0;
  // TODO: модуля алертов/уведомлений нет → пустой список.
  const visibleAlerts: unknown[] = [];

  // active-клиенты по статусу; если статуса нет — считаем всех.
  const activeClients = (clients ?? []).filter((c) => c.status === 'active');
  const clientsCount = activeClients.length;
  const exercisesCount = exercises?.length ?? 0;

  // Онлайн-тренировки не учитываются в тренерском календаре.
  const sessionsOffline = (sessionsMonth ?? []).filter((s) => !s.isOnline);

  // Hero: сегодняшние офлайн-сессии (любой статус, как в оригинале).
  const todayCount = sessionsOffline.filter((s) => s.date === today).length;

  // Календарь: запланированные/проведённые на 30 дней (не cancelled).
  const plannedNext30d = sessionsOffline.filter((s) => s.status !== 'cancelled').length;

  // Ближайшая будущая не-cancelled офлайн-сессия (по date+startTime ≥ now).
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nextSession = sessionsOffline
    .filter((s) => {
      if (s.status === 'cancelled') return false;
      if (s.date > today) return true;
      if (s.date < today) return false;
      return timeToMinutes(s.startTime) >= nowMinutes;
    })
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
    )[0];

  const nextSessionDate = nextSession ? toLocalDate(nextSession.date, nextSession.startTime) : null;

  // Имя клиента для строки «следующей» резолвим из списка клиентов.
  const nextClient = nextSession
    ? (clients ?? []).find((c) => c.id === nextSession.clientId)
    : undefined;

  const dateLabel = `СЕГОДНЯ · ${DAY_SHORT[now.getDay()]} ${now.getDate()} ${MONTH_FULL[now.getMonth()]}`;

  // Прибыль за месяц = balance (доходы − расходы).
  const balanceMonth = finance?.balance ?? 0;
  // В тысячах ₽, знак минуса — типографский, без суффикса.
  const fmtThousands = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n / 1000))}`;
  const profitColor = balanceMonth >= 0 ? 'var(--color-accent-text)' : 'var(--color-danger)';

  // Один acid-fill на экран — primary плитка. Сейчас алертов/чата нет → null.
  const primaryKey: TileKey | null =
    visibleAlerts.length > 0 ? 'notifications' : chatBadge > 0 ? 'chat' : null;

  const tiles: Array<{
    key: TileKey;
    title: string;
    sub: string;
    metrics: Metric[];
    Icon: LucideIcon;
    onClick: () => void;
    metricColor?: string;
    kicker?: string;
  }> = [
    {
      key: 'clients',
      title: 'Клиенты',
      sub: 'контакты и пакеты',
      metrics: [{ v: pad2(clientsCount), s: 'активных' }],
      Icon: Users,
      onClick: () => void navigate('/clients'),
    },
    {
      key: 'calendar',
      title: 'Календарь',
      sub: 'расписание занятий',
      metrics: [{ v: pad2(plannedNext30d), s: 'на 30 дней' }],
      Icon: CalendarDays,
      onClick: () => void navigate('/calendar'),
    },
    {
      key: 'chat',
      title: 'Сообщения',
      sub: 'клиенты и заметки',
      metrics: [{ v: pad2(chatBadge), s: 'новых' }],
      Icon: MessageSquare,
      onClick: () => void navigate('/messages'),
    },
    {
      key: 'exercises',
      title: 'База знаний',
      sub: 'упражнения и шаблоны',
      metrics: [{ v: pad2(exercisesCount), s: 'в базе' }],
      Icon: BookOpen,
      onClick: () => void navigate('/knowledge'),
    },
    {
      key: 'finance',
      title: 'Финансы',
      sub: 'бухгалтерия',
      metrics: [{ v: fmtThousands(balanceMonth), s: ['тыс', 'за', '1 мес'] }],
      metricColor: profitColor,
      Icon: Wallet,
      onClick: () => void navigate('/accounting'),
    },
    {
      key: 'notifications',
      title: 'Уведомления',
      sub: visibleAlerts.length > 0 ? 'требуют внимания' : 'нет открытых задач',
      metrics: visibleAlerts.length > 0 ? [{ v: pad2(visibleAlerts.length), s: 'новых' }] : [],
      kicker: visibleAlerts.length > 0 ? 'НОВЫЕ' : 'ВСЁ ТИХО',
      Icon: Bell,
      onClick: () => void navigate('/notifications'),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex flex-1 flex-col overflow-hidden px-5 pb-5 pt-2">
        {/* ─── Top bar: дата слева ─── */}
        <div className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-mutedxl)]">
          {dateLabel}
        </div>

        {/* ─── Шестерёнка → профиль тренера, на одной линии с датой ─── */}
        <button
          type="button"
          onClick={() => void navigate('/profile')}
          aria-label="Профиль тренера"
          className="absolute right-5 top-2 z-10 flex items-center justify-center transition-transform active:scale-95"
        >
          <Settings size={20} strokeWidth={1.8} className="text-[var(--color-ink-muted)]" />
        </button>

        {/* ─── Hero: большое число сессий сегодня ─── */}
        <div className="px-1 pb-1 pt-3">
          <button
            type="button"
            onClick={() => void navigate('/calendar')}
            className="flex flex-wrap items-baseline gap-3 text-left transition-transform active:scale-[0.98]"
            aria-label="Открыть календарь на сегодня"
          >
            <span
              className="font-[family-name:var(--font-display)] text-[64px] leading-none tracking-[-0.03em]"
              style={{ color: 'var(--color-accent-text)' }}
            >
              {pad2(todayCount)}
            </span>
            <span className="text-[22px] font-bold leading-tight tracking-[-0.01em]">
              {todayCount === 1 ? 'сессия в зале' : 'сессий в зале'}
            </span>
          </button>

          {nextSession && nextSessionDate && (
            <button
              type="button"
              onClick={() => void navigate(`/clients/${nextSession.clientId}`)}
              aria-label="Открыть карточку клиента следующей сессии"
              className="mt-3 flex w-full items-center gap-2.5 text-left transition-transform active:scale-[0.98]"
            >
              <div className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
                СЛЕД. · {nextSession.startTime}
                {nextClient
                  ? ` ${nextClient.firstName.toUpperCase()} ${nextClient.lastName.charAt(0).toUpperCase()}.`
                  : ''}
                {nextSession.title ? ` · ${nextSession.title.toUpperCase()}` : ''}
              </div>
              <span className="inline-block rounded bg-[var(--color-accent)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.06em] text-[var(--color-accent-on)]">
                {diffShort(nextSessionDate, now)}
              </span>
              <ArrowRight
                size={18}
                strokeWidth={2.4}
                style={{ color: 'var(--color-accent)' }}
                className="shrink-0"
              />
            </button>
          )}
        </div>

        {/* ─── Сетка 2×3 модулей ─── */}
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-2.5">
          {tiles.map((tile) => {
            const { key, ...rest } = tile;
            return <Tile key={key} {...rest} isPrimary={primaryKey === key} />;
          })}
        </div>
      </div>
    </div>
  );
}

type TileProps = {
  title: string;
  sub: string;
  metrics: Metric[];
  Icon: LucideIcon;
  onClick: () => void;
  isPrimary: boolean;
  metricColor?: string;
  kicker?: string;
};

function MetricLabel({ value, color }: { value: string | string[]; color: string }) {
  const cls =
    'font-[family-name:var(--font-mono)] font-bold uppercase tracking-[0.08em] text-[10px] leading-[1.1] whitespace-pre';
  if (Array.isArray(value)) {
    return (
      <span className="inline-flex flex-col" style={{ color }}>
        {value.map((line, i) => (
          <span key={i} className={cls}>
            {line}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={cls} style={{ color }}>
      {value}
    </span>
  );
}

function Tile({ title, sub, metrics, Icon, onClick, isPrimary, metricColor, kicker }: TileProps) {
  // Простая ротация метрик каждые 10с (без flip-анимации — metric-row-* утилит
  // в нашем CSS нет; меняем индекс статично).
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (metrics.length <= 1) return;
    const id = window.setInterval(() => setIdx((x) => (x + 1) % metrics.length), 10000);
    return () => window.clearInterval(id);
  }, [metrics.length]);
  const current = metrics.length > 0 ? (metrics[idx] ?? metrics[0]) : null;
  const labelColor = isPrimary ? 'rgba(11,12,16,0.65)' : 'var(--color-ink-muted)';

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'relative flex h-full min-h-[120px] flex-col rounded-2xl px-3.5 pb-4 pt-3.5 text-left active:scale-[0.97] ' +
        (isPrimary ? 'tile-shadow-primary' : 'tile-shadow')
      }
    >
      <span
        className={`-ml-3 -mt-3 flex h-10 w-10 items-center justify-center rounded-lg ${isPrimary ? 'tile-icon-shell-primary' : 'tile-icon-shell'}`}
      >
        <Icon size={20} strokeWidth={1.8} />
      </span>

      <ArrowUpRight
        size={14}
        className={`absolute right-3.5 top-4 ${isPrimary ? 'tile-arrow-primary' : 'tile-arrow'}`}
        strokeWidth={1.8}
      />

      <span className="flex-1" />

      {kicker && (
        <div
          className="mb-1 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: isPrimary ? 'rgba(11,12,16,0.55)' : 'var(--color-ink-mutedxl)' }}
        >
          {kicker}
        </div>
      )}

      {current && (
        <div className="mb-1 flex items-center gap-2.5">
          <span
            className="shrink-0 font-[family-name:var(--font-display)] text-[36px] leading-none tracking-[-0.03em] tabular-nums"
            style={metricColor ? { color: metricColor } : undefined}
          >
            {current.v}
          </span>
          <MetricLabel value={current.s} color={labelColor} />
        </div>
      )}

      <div className="truncate text-[17px] font-bold leading-tight tracking-[-0.02em]">{title}</div>
      <div
        className="mt-1 truncate text-[11px] font-semibold tracking-[0.01em]"
        style={{ color: isPrimary ? 'rgba(11,12,16,0.55)' : 'var(--color-ink-mutedxl)' }}
      >
        {sub}
      </div>
    </button>
  );
}
