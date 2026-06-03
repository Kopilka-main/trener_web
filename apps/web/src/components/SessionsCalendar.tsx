import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Wifi, X } from 'lucide-react';
import type { SessionResponse, SessionStatus } from '@trener/shared';
import {
  CAL_HOURS,
  CAL_START_HOUR,
  DAY_FULL,
  DAY_SHORT,
  MONTH_FULL,
  MONTH_GEN,
  addDays,
  addMonths,
  endTime,
  monthGrid,
  sameDay,
  startOfWeek,
  timeToMin,
  toISODate,
  weekDates,
  weekdayMon,
} from '../lib/calendar';

export type CalendarView = 'day' | 'week' | 'month';

/** Высота одного часа в day/week-сетке (px). */
const DAY_HOUR_H = 56;
const WEEK_HOUR_H = 48;
/** Автоскролл при монтаже к 7:00 — типичное начало рабочего дня тренера. */
const SCROLL_HOUR = 7;

/** Метка блока занятия по умолчанию. */
function defaultLabel(s: SessionResponse): string {
  return s.title ?? 'Занятие';
}

export type SessionsCalendarProps = {
  sessions: SessionResponse[];
  /** Стартовый вид (по умолчанию — месяц). */
  defaultView?: CalendarView;
  /** Тап по пустому слоту (создание занятия). */
  onSlotClick: (date: Date, hour: number) => void;
  /** Тап по существующему занятию (редактирование). */
  onSessionClick: (session: SessionResponse) => void;
  /** Метка-заголовок блока занятия (по умолчанию — title ?? 'Занятие'). */
  renderLabel?: (s: SessionResponse) => string;
  /** Управляемый якорь периода (опц.). Если передан onAnchorChange — компонент управляемый. */
  anchor?: Date;
  onAnchorChange?: (d: Date) => void;
};

/**
 * Переиспользуемый календарь занятий: виды день/неделя/месяц, навигация периода,
 * часовая сетка с автоскроллом к 7:00, нижний переключатель вида.
 * Вид и якорь периода — внутреннее состояние (якорь можно поднять через anchor/onAnchorChange).
 */
export function SessionsCalendar({
  sessions,
  defaultView = 'month',
  onSlotClick,
  onSessionClick,
  renderLabel = defaultLabel,
  anchor: anchorProp,
  onAnchorChange,
}: SessionsCalendarProps) {
  const [view, setView] = useState<CalendarView>(defaultView);
  const [anchorState, setAnchorState] = useState<Date>(() => anchorProp ?? new Date());
  const anchor = anchorProp ?? anchorState;
  const setAnchor = (next: Date) => {
    if (onAnchorChange) onAnchorChange(next);
    if (anchorProp === undefined) setAnchorState(next);
  };

  const shift = (dir: -1 | 1) => {
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === 'week') setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addMonths(anchor, dir));
  };

  const periodLabel = useMemo(() => {
    if (view === 'day') {
      return `${DAY_FULL[weekdayMon(anchor)]}, ${String(anchor.getDate())} ${MONTH_GEN[anchor.getMonth()]}`;
    }
    if (view === 'week') {
      const a = startOfWeek(anchor);
      const b = addDays(a, 6);
      return a.getMonth() === b.getMonth()
        ? `${String(a.getDate())}–${String(b.getDate())} ${MONTH_GEN[b.getMonth()]}`
        : `${String(a.getDate())} ${MONTH_GEN[a.getMonth()]} – ${String(b.getDate())} ${MONTH_GEN[b.getMonth()]}`;
    }
    return `${MONTH_FULL[anchor.getMonth()]} ${String(anchor.getFullYear())}`;
  }, [view, anchor]);

  const pickDay = (d: Date) => {
    setAnchor(d);
    setView('day');
  };

  return (
    <div className="flex h-full flex-col pb-16">
      {/* Шапка периода: ‹ / подпись / › + «Сегодня» */}
      <div className="flex items-center gap-1 px-4 pb-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Предыдущий период"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink active:bg-card-elevated"
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1 text-center text-[15px] font-semibold text-ink">
          {periodLabel}
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Следующий период"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink active:bg-card-elevated"
        >
          <ChevronRight size={20} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(new Date())}
          className="ml-1 shrink-0 rounded-full bg-chip px-3 py-1.5 text-[12px] font-semibold text-ink-muted active:bg-card-elevated"
        >
          Сегодня
        </button>
      </div>

      {view === 'month' && <MonthView anchor={anchor} sessions={sessions} onPickDay={pickDay} />}
      {view === 'week' && (
        <WeekView
          anchor={anchor}
          sessions={sessions}
          onPick={onSessionClick}
          onPickDay={pickDay}
          onSlot={onSlotClick}
          renderLabel={renderLabel}
        />
      )}
      {view === 'day' && (
        <DayView
          date={anchor}
          sessions={sessions}
          onPick={onSessionClick}
          onSlot={(hour) => onSlotClick(anchor, hour)}
          renderLabel={renderLabel}
        />
      )}

      {/* Нижний переключатель вида: зафиксирован по центру (как FAB «+») */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-5">
        <ViewSwitcher value={view} onChange={setView} />
      </div>
    </div>
  );
}

function ViewSwitcher({
  value,
  onChange,
}: {
  value: CalendarView;
  onChange: (v: CalendarView) => void;
}) {
  const options: { value: CalendarView; label: string }[] = [
    { value: 'day', label: 'День' },
    { value: 'week', label: 'Неделя' },
    { value: 'month', label: 'Месяц' },
  ];
  return (
    <div className="pointer-events-auto inline-flex rounded-full bg-card p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              active ? 'bg-accent text-accent-on' : 'text-ink-muted'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Цвет блока занятия по статусу ---
// planned   — акцентный лайм (bg-accent text-accent-on)
// completed — приглушённый (bg-card-elevated)
// cancelled — перечёркнут + opacity-50
function tileClasses(status: SessionStatus): string {
  if (status === 'planned') return 'bg-accent text-accent-on';
  if (status === 'completed') return 'bg-card-elevated text-ink';
  return 'bg-card-elevated text-ink-muted line-through opacity-50';
}

/** Индикатор ответа клиента: ✓ подтвердил, ✕ отклонил, ничего — ждёт ответа. */
function ConfirmMark({ value }: { value: SessionResponse['clientConfirmation'] }) {
  if (value === 'confirmed') return <Check size={12} strokeWidth={2.4} className="shrink-0" />;
  if (value === 'declined')
    return <X size={12} strokeWidth={2.4} className="shrink-0 opacity-70" />;
  return null;
}

/** Сессии конкретного дня, отсортированы по времени. */
function sessionsOf(sessions: SessionResponse[], d: Date): SessionResponse[] {
  const iso = toISODate(d);
  return sessions
    .filter((s) => s.date === iso)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function MonthView({
  anchor,
  sessions,
  onPickDay,
}: {
  anchor: Date;
  sessions: SessionResponse[];
  onPickDay: (d: Date) => void;
}) {
  const cells = monthGrid(anchor);
  const month = anchor.getMonth();
  const now = new Date();

  // Счётчики по дате: planned vs остальные (completed/cancelled).
  const counts = useMemo(() => {
    const map = new Map<string, { planned: number; other: number }>();
    for (const s of sessions) {
      const c = map.get(s.date) ?? { planned: 0, other: 0 };
      if (s.status === 'planned') c.planned += 1;
      else c.other += 1;
      map.set(s.date, c);
    }
    return map;
  }, [sessions]);

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-1">
      <div className="grid grid-cols-7 gap-1 pb-1">
        {DAY_SHORT.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-ink-muted">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const iso = toISODate(d);
          const c = counts.get(iso);
          const inMonth = d.getMonth() === month;
          const today = sameDay(d, now);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPickDay(d)}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl bg-card active:bg-card-elevated ${
                today ? 'ring-2 ring-accent' : ''
              } ${inMonth ? '' : 'opacity-40'}`}
            >
              <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold tabular-nums text-ink">
                {d.getDate()}
              </span>
              {c && (c.planned > 0 || c.other > 0) ? (
                <span className="flex items-center gap-0.5">
                  {c.planned > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                  )}
                  {c.other > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-mutedxl" aria-hidden />
                  )}
                </span>
              ) : (
                <span className="h-1.5" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Скроллируемый контейнер day/week — при монтаже/смене даты скроллит к 7:00. */
function ScrollableGrid({
  hourHeight,
  children,
}: {
  hourHeight: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: (SCROLL_HOUR - CAL_START_HOUR) * hourHeight, behavior: 'auto' });
  }, [hourHeight]);
  return (
    <div ref={ref} className="flex-1 overflow-y-auto pb-6">
      {children}
    </div>
  );
}

function NowLine({ top, hourHeight }: { top: number; hourHeight: number }) {
  const gridH = CAL_HOURS * hourHeight;
  if (top < 0 || top > gridH) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top }}>
      <div className="h-2 w-2 -translate-x-1 rounded-full bg-coral" />
      <div className="h-px flex-1 bg-coral" />
    </div>
  );
}

function DayView({
  date,
  sessions,
  onPick,
  onSlot,
  renderLabel,
}: {
  date: Date;
  sessions: SessionResponse[];
  onPick: (s: SessionResponse) => void;
  onSlot: (hour: number) => void;
  renderLabel: (s: SessionResponse) => string;
}) {
  const hours = Array.from({ length: CAL_HOURS }, (_, i) => CAL_START_HOUR + i);
  const items = sessionsOf(sessions, date);
  const now = new Date();
  const gridH = CAL_HOURS * DAY_HOUR_H;
  const nowTop = ((now.getHours() * 60 + now.getMinutes() - CAL_START_HOUR * 60) / 60) * DAY_HOUR_H;

  return (
    <ScrollableGrid hourHeight={DAY_HOUR_H}>
      <div className="flex px-4 pt-3">
        <div className="relative w-10 shrink-0" style={{ height: gridH }}>
          {hours.map((h, i) => (
            <span
              key={h}
              className="absolute -translate-y-1/2 font-[family-name:var(--font-mono)] text-[10px] tabular-nums text-ink-muted"
              style={{ top: i * DAY_HOUR_H }}
            >
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        <div className="relative flex-1 border-l border-line" style={{ height: gridH }}>
          {hours.map((h, i) => (
            <button
              key={`slot-${String(h)}`}
              type="button"
              onClick={() => onSlot(h)}
              className="absolute inset-x-0 border-t border-line active:bg-card-elevated/40"
              style={{ top: i * DAY_HOUR_H, height: DAY_HOUR_H }}
              aria-label={`Добавить занятие на ${String(h).padStart(2, '0')}:00`}
            />
          ))}
          {sameDay(date, now) && <NowLine top={nowTop} hourHeight={DAY_HOUR_H} />}
          {items.map((s) => {
            const startMin = timeToMin(s.startTime);
            const top = ((startMin - CAL_START_HOUR * 60) / 60) * DAY_HOUR_H;
            const height = Math.max((s.durationMin / 60) * DAY_HOUR_H - 2, 18);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
                className={`absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-xl px-2.5 py-1.5 text-left ${tileClasses(s.status)}`}
                style={{ top, height }}
              >
                <div className="flex items-center gap-1.5">
                  {s.isOnline && <Wifi size={12} strokeWidth={2.2} className="shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                    {renderLabel(s)}
                  </span>
                  <ConfirmMark value={s.clientConfirmation} />
                </div>
                <div className="truncate font-[family-name:var(--font-mono)] text-[11px] opacity-80">
                  {[`${s.startTime}–${endTime(s.startTime, s.durationMin)}`, s.location]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ScrollableGrid>
  );
}

function WeekView({
  anchor,
  sessions,
  onPick,
  onPickDay,
  onSlot,
  renderLabel,
}: {
  anchor: Date;
  sessions: SessionResponse[];
  onPick: (s: SessionResponse) => void;
  onPickDay: (d: Date) => void;
  onSlot: (date: Date, hour: number) => void;
  renderLabel: (s: SessionResponse) => string;
}) {
  const dates = weekDates(anchor);
  const hours = Array.from({ length: CAL_HOURS }, (_, i) => CAL_START_HOUR + i);
  const now = new Date();
  const gridH = CAL_HOURS * WEEK_HOUR_H;
  const todayIndex = dates.findIndex((d) => sameDay(d, now));
  const nowTop =
    ((now.getHours() * 60 + now.getMinutes() - CAL_START_HOUR * 60) / 60) * WEEK_HOUR_H;

  return (
    <ScrollableGrid hourHeight={WEEK_HOUR_H}>
      <div className="px-2 pt-1">
        <div className="sticky top-0 z-30 flex border-b border-line bg-bg pb-1.5 pt-1">
          <div className="w-7 shrink-0" />
          {dates.map((d) => {
            const today = sameDay(d, now);
            return (
              <button
                key={toISODate(d)}
                type="button"
                onClick={() => onPickDay(d)}
                className="flex-1 text-center"
              >
                <div className="text-[10px] text-ink-muted">{DAY_SHORT[weekdayMon(d)]}</div>
                <div
                  className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full font-[family-name:var(--font-mono)] text-[12px] font-bold tabular-nums ${
                    today ? 'bg-accent text-accent-on' : 'text-ink'
                  }`}
                >
                  {d.getDate()}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex">
          <div className="relative w-7 shrink-0" style={{ height: gridH }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute -translate-y-1/2 font-[family-name:var(--font-mono)] text-[9px] tabular-nums text-ink-muted"
                style={{ top: i * WEEK_HOUR_H }}
              >
                {h}
              </span>
            ))}
          </div>
          <div className="relative grid flex-1 grid-cols-7">
            {todayIndex >= 0 && nowTop >= 0 && nowTop <= gridH && (
              <>
                <div
                  className="pointer-events-none absolute left-0 right-0 z-20 h-px bg-coral"
                  style={{ top: nowTop }}
                />
                <div
                  className="pointer-events-none absolute z-20 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-coral"
                  style={{ top: nowTop, left: `${String(((todayIndex + 0.5) / 7) * 100)}%` }}
                />
              </>
            )}
            {dates.map((d) => {
              const items = sessionsOf(sessions, d);
              return (
                <div
                  key={toISODate(d)}
                  className="relative border-l border-line"
                  style={{ height: gridH }}
                >
                  {hours.map((h, i) => (
                    <button
                      key={`slot-${String(h)}`}
                      type="button"
                      onClick={() => onSlot(d, h)}
                      className="absolute inset-x-0 border-t border-line active:bg-card-elevated/40"
                      style={{ top: i * WEEK_HOUR_H, height: WEEK_HOUR_H }}
                      aria-label={`Добавить занятие ${DAY_SHORT[weekdayMon(d)]} ${String(d.getDate())} в ${String(h).padStart(2, '0')}:00`}
                    />
                  ))}
                  {items.map((s) => {
                    const startMin = timeToMin(s.startTime);
                    const top = ((startMin - CAL_START_HOUR * 60) / 60) * WEEK_HOUR_H;
                    const height = Math.max((s.durationMin / 60) * WEEK_HOUR_H - 1, 14);
                    const label = renderLabel(s);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onPick(s)}
                        className={`absolute inset-x-[1px] z-10 flex items-center justify-center overflow-hidden rounded-md px-0.5 ${tileClasses(s.status)}`}
                        style={{ top, height }}
                      >
                        {s.isOnline ? (
                          <Wifi
                            size={height < 20 ? 10 : 12}
                            strokeWidth={2.2}
                            className="shrink-0"
                          />
                        ) : (
                          <span className="truncate text-[10px] font-semibold leading-none">
                            {label}
                          </span>
                        )}
                        <ConfirmMark value={s.clientConfirmation} />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollableGrid>
  );
}
