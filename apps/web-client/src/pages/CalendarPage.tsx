import { useMemo, useState } from 'react';
import { Wifi, X } from 'lucide-react';
import type { SessionResponse } from '@trener/shared';
import { useClientMe } from '../api/auth';
import { useClientSessions, useConfirmSession } from '../api/calendar';
import { SessionsCalendar } from '../components/SessionsCalendar';
import { MONTH_GEN, endTime, humanDuration, monthGrid, parseISO, toISODate } from '../lib/calendar';

const CONFIRM_LABEL: Record<SessionResponse['clientConfirmation'], string> = {
  pending: 'Ожидает ответа',
  confirmed: 'Вы подтвердили',
  declined: 'Вы отклонили',
};

/** Занятие в прошлом: дата+время начала <= now. */
function isPast(s: SessionResponse): boolean {
  const d = parseISO(s.date);
  const [h, m] = s.startTime.split(':').map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime() <= Date.now();
}

export function CalendarPage() {
  const me = useClientMe();
  const linked = me.data?.link != null;
  const [anchor, setAnchor] = useState<Date>(new Date());

  // Диапазон месяца-сетки текущего якоря (42 дня) — покрывает day/week/month.
  const { from, to } = useMemo(() => {
    const grid = monthGrid(anchor);
    const first = grid[0];
    const last = grid[grid.length - 1];
    return {
      from: first ? toISODate(first) : undefined,
      to: last ? toISODate(last) : undefined,
    };
  }, [anchor]);

  const sessions = useClientSessions(from, to);
  const list = sessions.data ?? [];

  const [selected, setSelected] = useState<SessionResponse | null>(null);

  return (
    <div className="flex h-full flex-col">
      <h1 className="px-4 pb-1 pt-5 font-[family-name:var(--font-display)] text-[24px] text-ink">
        Календарь
      </h1>

      {!linked ? (
        <p className="px-5 pt-6 text-sm text-ink-muted">
          Вы пока не подключены к тренеру. Подключите его, чтобы здесь появились назначенные
          занятия.
        </p>
      ) : sessions.isError ? (
        <p className="px-5 pt-4 text-sm text-ink-muted" role="alert">
          Не удалось загрузить занятия. Попробуйте обновить страницу.
        </p>
      ) : (
        <SessionsCalendar
          sessions={list}
          defaultView="week"
          anchor={anchor}
          onAnchorChange={setAnchor}
          onSessionClick={setSelected}
        />
      )}

      {selected && <SessionSheet session={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SessionSheet({ session, onClose }: { session: SessionResponse; onClose: () => void }) {
  const confirm = useConfirmSession();
  const past = isPast(session);
  const d = parseISO(session.date);
  const dateLabel = `${String(d.getDate())} ${MONTH_GEN[d.getMonth()]}`;
  const timeLabel = `${session.startTime}–${endTime(session.startTime, session.durationMin)}`;

  function respond(status: 'confirmed' | 'declined') {
    confirm.mutate({ id: session.id, status }, { onSuccess: onClose });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 flex flex-col gap-4 rounded-t-3xl bg-bg px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-bold text-ink">{session.title ?? 'Занятие'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 text-[14px] text-ink">
          <span className="font-semibold">
            {dateLabel}, {timeLabel}
          </span>
          <span className="text-ink-muted">{humanDuration(session.durationMin)}</span>
          {session.isOnline ? (
            <span className="flex items-center gap-1.5 text-ink-muted">
              <Wifi size={14} strokeWidth={2} /> Онлайн-занятие
            </span>
          ) : (
            session.location && <span className="text-ink-muted">{session.location}</span>
          )}
          {session.note && <span className="text-ink-muted">{session.note}</span>}
        </div>

        <div className="rounded-2xl bg-card px-4 py-3 text-[13px] font-semibold text-ink-muted">
          {CONFIRM_LABEL[session.clientConfirmation]}
        </div>

        {!past && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={confirm.isPending}
              onClick={() => respond('confirmed')}
              className="flex-1 rounded-2xl bg-accent py-3.5 text-[15px] font-bold text-accent-on active:opacity-90 disabled:opacity-50"
            >
              Подтвердить
            </button>
            <button
              type="button"
              disabled={confirm.isPending}
              onClick={() => respond('declined')}
              className="flex-1 rounded-2xl bg-card py-3.5 text-[15px] font-semibold text-ink active:bg-card-elevated disabled:opacity-50"
            >
              Отклонить
            </button>
          </div>
        )}

        {confirm.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось сохранить. Попробуйте снова.
          </p>
        )}
      </div>
    </div>
  );
}
