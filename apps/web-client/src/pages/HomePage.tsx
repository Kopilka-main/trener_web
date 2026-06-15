import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Dumbbell,
  MessageSquare,
  Settings,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useClientMe } from '../api/auth';
import { useClientSessions } from '../api/calendar';
import { useClientWorkouts } from '../api/workouts';
import { useClientChatUnread, useClientMessages } from '../api/chat';
import { useClientPackages } from '../api/packages';
import { useClientTrainer } from '../api/trainer';
import { aggregateExerciseOverview } from '../lib/workout-stats';
import { buildClientNotifications, loadDismissed } from '../lib/notifications';

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
}
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}
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
type TileKey = 'workouts' | 'calendar' | 'chat' | 'progress' | 'knowledge' | 'notifications';

export function HomePage() {
  const navigate = useNavigate();
  const me = useClientMe();
  const linked = me.data?.link != null;

  const now = new Date();
  const today = isoDate(now);
  const monthAhead = isoDate(new Date(now.getTime() + 30 * 86400000));

  const sessions = useClientSessions(today, monthAhead).data ?? [];
  const workouts = useClientWorkouts().data ?? [];
  const unread = useClientChatUnread().data ?? 0;
  const packages = useClientPackages().data ?? [];
  // Остаток оплаченных тренировок — как у тренера: сумма активных пакетов (lessonsPaid)
  // минус проведённые ТРЕНЕРСКИЕ тренировки (status='completed', не самостоятельные клиента).
  // Черновики/самостоятельные тренировки в остаток не входят.
  const paidLessons = packages
    .filter((p) => p.status === 'active')
    .reduce((acc, p) => acc + p.lessonsPaid, 0);
  const completedTrainerWorkouts = workouts.filter(
    (w) => w.status === 'completed' && !w.createdByClient,
  ).length;
  const paidBalance = paidLessons - completedTrainerWorkouts;
  const chatMessages = useClientMessages().data?.messages ?? [];
  const trainer = useClientTrainer().data;
  // Открытые задачи от тренера — тоже «требуют внимания» в плитке уведомлений.
  const openTasks = chatMessages.filter((m) => m.kind === 'task' && m.taskDone !== true).length;
  // Обзор упражнений из проведённых тренировок: для «Базы знаний» (кол-во упражнений)
  // и «Прогресса» (кол-во поставленных рекордов в последних сессиях).
  const exerciseOverview = aggregateExerciseOverview(workouts);
  const recordsCount = exerciseOverview.filter((e) => e.lastIsRecord).length;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Не cancelled на 30 дней (диапазон запроса).
  const plannedNext30d = sessions.filter((s) => s.status !== 'cancelled').length;

  // Ближайшая будущая не-cancelled сессия.
  const nextSession = sessions
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

  const notifications = buildClientNotifications({
    sessions,
    unread,
    now,
    dismissed: loadDismissed(),
    packages,
    workouts,
  });

  // Один acid-fill на экран. Непрочитанные в чате → акцент на «Чат»; иначе прочие
  // уведомления (подтверждения/скоро) → «Уведомления»; иначе без акцента.
  // Уведомления, требующие внимания = прочие уведомления + открытые задачи.
  const attention = notifications.length + openTasks;
  const primaryKey: TileKey | null = unread > 0 ? 'chat' : attention > 0 ? 'notifications' : null;

  const tiles: Array<{
    key: TileKey;
    title: string;
    sub: string;
    metrics: Metric[];
    Icon: LucideIcon;
    onClick: () => void;
    kicker?: string;
  }> = [
    {
      key: 'workouts',
      title: 'Тренировки',
      sub: 'журнал занятий',
      metrics: [{ v: pad2(workouts.length), s: 'завершено' }],
      Icon: Dumbbell,
      onClick: () => void navigate('/workouts'),
    },
    {
      key: 'calendar',
      title: 'Календарь',
      sub: 'расписание',
      metrics: [{ v: pad2(plannedNext30d), s: 'на 30 дней' }],
      Icon: CalendarDays,
      onClick: () => void navigate('/calendar'),
    },
    {
      key: 'chat',
      title: 'Чат',
      sub: 'тренер на связи',
      metrics: [{ v: pad2(unread), s: 'новых' }],
      Icon: MessageSquare,
      onClick: () => void navigate('/chat'),
    },
    {
      key: 'progress',
      title: 'Прогресс',
      sub: 'рекорды и графики',
      metrics: [{ v: pad2(recordsCount), s: 'рекордов' }],
      Icon: TrendingUp,
      onClick: () => void navigate('/progress'),
    },
    {
      key: 'knowledge',
      title: 'База знаний',
      sub: 'упражнения с тренировок',
      metrics: [{ v: pad2(exerciseOverview.length), s: 'упражнений' }],
      Icon: BookOpen,
      onClick: () => void navigate('/knowledge'),
    },
    {
      key: 'notifications',
      title: 'Уведомления',
      sub: attention > 0 ? 'требуют внимания' : 'нет открытых задач',
      metrics: attention > 0 ? [{ v: pad2(attention), s: 'новых' }] : [],
      kicker: attention > 0 ? 'НОВЫЕ' : 'ВСЁ ТИХО',
      Icon: Bell,
      onClick: () => void navigate('/notifications'),
    },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="relative flex flex-1 flex-col overflow-hidden px-2 pb-5 pt-2">
        {/* Тренер: аватар + имя (→ страница тренера). Справа в шапке — шестерёнка. */}
        {linked && trainer && (
          <button
            type="button"
            onClick={() => void navigate('/trainer')}
            aria-label="Тренер"
            className="mb-1 flex items-center gap-2.5 self-start pr-12 text-left active:opacity-70"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-elevated">
              {trainer.avatarFileId ? (
                <img
                  src={`/api/client/trainer/avatar?v=${trainer.avatarFileId}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[12px] font-bold text-ink">
                  {initials(trainer.firstName, trainer.lastName)}
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-semibold leading-tight text-ink">
                {trainer.firstName} {trainer.lastName}
              </span>
              <span className="text-[11px] leading-tight text-ink-muted">тренер</span>
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => void navigate('/profile')}
          aria-label="Профиль"
          className="absolute right-3 top-3 z-10 flex items-center justify-center transition-transform active:scale-95"
        >
          <Settings size={30} strokeWidth={1.8} className="text-[var(--color-ink-muted)]" />
        </button>

        <div className="pb-1 pt-1">
          {linked ? (
            <>
              <button
                type="button"
                onClick={() => void navigate('/profile')}
                aria-label="Оплаченные тренировки"
                className="flex items-center gap-2.5 pb-2 text-left transition-transform active:scale-[0.98]"
              >
                <span
                  className="font-[family-name:var(--font-display)] text-[64px] leading-none tracking-[-0.03em]"
                  style={{
                    color: paidBalance < 0 ? 'var(--color-danger)' : 'var(--color-accent-text)',
                  }}
                >
                  {paidBalance < 0 ? String(paidBalance) : pad2(paidBalance)}
                </span>
                <span className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
                  количество
                  <br />
                  тренировок
                </span>
              </button>
              {nextSession && nextSessionDate && (
                <button
                  type="button"
                  onClick={() => void navigate('/calendar')}
                  aria-label="Открыть календарь"
                  className="flex w-full items-center gap-2.5 text-left transition-transform active:scale-[0.98]"
                >
                  <div className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
                    СЛЕД. · {nextSession.startTime}
                    {nextSession.title ? ` · ${nextSession.title.toUpperCase()}` : ''}
                  </div>
                  <span className="inline-block rounded bg-[var(--color-accent)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.06em] text-[var(--color-accent-on)]">
                    {diffShort(nextSessionDate, now)}
                  </span>
                  <ArrowRight
                    size={18}
                    strokeWidth={2.4}
                    style={{ color: 'var(--color-accent-text)' }}
                    className="shrink-0"
                  />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => void navigate('/connect')}
              className="flex flex-col gap-1 text-left transition-transform active:scale-[0.98]"
              aria-label="Подключить тренера"
            >
              <span
                className="font-[family-name:var(--font-display)] text-[30px] leading-tight tracking-[-0.02em]"
                style={{ color: 'var(--color-accent-text)' }}
              >
                Подключите тренера
              </span>
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-muted)]">
                чтобы видеть занятия и прогресс
                <ArrowRight
                  size={15}
                  strokeWidth={2.2}
                  style={{ color: 'var(--color-accent-text)' }}
                />
              </span>
            </button>
          )}
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-2">
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

function Tile({ title, sub, metrics, Icon, onClick, isPrimary, kicker }: TileProps) {
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
          <span className="shrink-0 font-[family-name:var(--font-display)] text-[36px] leading-none tracking-[-0.03em] tabular-nums">
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
