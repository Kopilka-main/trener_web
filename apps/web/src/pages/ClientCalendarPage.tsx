import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Trash2, Wifi, X } from 'lucide-react';
import type { SessionResponse, SessionStatus } from '@trener/shared';
import {
  useClientSessions,
  useCreateSession,
  useDeleteSession,
  useUpdateSession,
} from '../api/sessions';
import { useClient } from '../api/clients';
import { ScreenHeader } from '../components/ScreenHeader';
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

type View = 'day' | 'week' | 'month';

const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'Запланировано',
  completed: 'Проведено',
  cancelled: 'Отменено',
};

const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

/** Высота одного часа в day/week-сетке (px). */
const DAY_HOUR_H = 56;
const WEEK_HOUR_H = 48;
/** Автоскролл при монтаже к 7:00 — типичное начало рабочего дня тренера. */
const SCROLL_HOUR = 7;

function formatDuration(min: number): string {
  if (min < 60) return `${String(min)} мин`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${String(h)} ч` : `${String(h)} ч ${String(rest)} мин`;
}

/** Тап по пустому слоту: предзаполненные дата+время для новой сессии. */
type CreateAt = { date: string; startTime: string };

export function ClientCalendarPage() {
  const { id = '' } = useParams<{ id: string }>();
  const sessions = useClientSessions(id);
  const client = useClient(id);

  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState<Date>(new Date());
  // null — форма закрыта; 'new' — создание без слота; SessionResponse — редактирование;
  // CreateAt — создание с предзаполненным слотом.
  const [editing, setEditing] = useState<SessionResponse | 'new' | null>(null);
  const [createAt, setCreateAt] = useState<CreateAt | null>(null);

  const list = useMemo(() => sessions.data ?? [], [sessions.data]);

  const shift = (dir: -1 | 1) => {
    if (view === 'day') setAnchor((d) => addDays(d, dir));
    else if (view === 'week') setAnchor((d) => addDays(d, dir * 7));
    else setAnchor((d) => addMonths(d, dir));
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

  const title = client.data
    ? `Календарь · ${client.data.firstName} ${client.data.lastName}`
    : 'Календарь';

  const openSlot = (date: Date, hour: number) => {
    setCreateAt({ date: toISODate(date), startTime: `${String(hour).padStart(2, '0')}:00` });
    setEditing(null);
  };
  const closeForm = () => {
    setEditing(null);
    setCreateAt(null);
  };
  const formOpen = editing !== null || createAt !== null;

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title={title} back={`/clients/${id}`} />

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

      {sessions.isError ? (
        <p className="px-5 pt-4 text-sm text-ink-muted" role="alert">
          Не удалось загрузить занятия. Попробуйте обновить страницу.
        </p>
      ) : (
        <>
          {view === 'month' && (
            <MonthView
              anchor={anchor}
              sessions={list}
              onPickDay={(d) => {
                setAnchor(d);
                setView('day');
              }}
            />
          )}
          {view === 'week' && (
            <WeekView
              anchor={anchor}
              sessions={list}
              onPick={setEditing}
              onPickDay={(d) => {
                setAnchor(d);
                setView('day');
              }}
              onSlot={openSlot}
            />
          )}
          {view === 'day' && (
            <DayView
              date={anchor}
              sessions={list}
              onPick={setEditing}
              onSlot={(hour) => openSlot(anchor, hour)}
            />
          )}
        </>
      )}

      {/* Нижние контролы: переключатель вида (по центру) + FAB «+» (справа) */}
      <div className="pointer-events-none sticky bottom-0 z-10 mt-auto flex items-end justify-between gap-3 px-5 pb-4 pt-2">
        <ViewSwitcher value={view} onChange={setView} />
        <button
          type="button"
          onClick={() => {
            setEditing('new');
            setCreateAt(null);
          }}
          aria-label="Запланировать занятие"
          className="tile-shadow-primary pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full active:scale-[0.95]"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>
      </div>

      {formOpen && (
        <SessionSheet
          clientId={id}
          session={editing === 'new' || editing === null ? null : editing}
          defaultDate={createAt?.date ?? toISODate(anchor)}
          defaultStartTime={createAt?.startTime}
          onClose={closeForm}
        />
      )}
    </div>
  );
}

function ViewSwitcher({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const options: { value: View; label: string }[] = [
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
}: {
  date: Date;
  sessions: SessionResponse[];
  onPick: (s: SessionResponse) => void;
  onSlot: (hour: number) => void;
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
                    {s.title ?? 'Занятие'}
                  </span>
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
}: {
  anchor: Date;
  sessions: SessionResponse[];
  onPick: (s: SessionResponse) => void;
  onPickDay: (d: Date) => void;
  onSlot: (date: Date, hour: number) => void;
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
                            {s.startTime}
                          </span>
                        )}
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

function SessionSheet({
  clientId,
  session,
  defaultDate,
  defaultStartTime,
  onClose,
}: {
  clientId: string;
  session: SessionResponse | null;
  defaultDate: string;
  defaultStartTime: string | undefined;
  onClose: () => void;
}) {
  const isEdit = session !== null;
  const createMutation = useCreateSession(clientId);
  const updateMutation = useUpdateSession(clientId);
  const deleteMutation = useDeleteSession(clientId);

  const [date, setDate] = useState(session?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(session?.startTime ?? defaultStartTime ?? '12:00');
  const [title, setTitle] = useState(session?.title ?? '');
  const [location, setLocation] = useState(session?.location ?? '');
  const [durationMin, setDurationMin] = useState(session?.durationMin ?? 60);
  const [isOnline, setIsOnline] = useState(session?.isOnline ?? false);
  const [status, setStatus] = useState<SessionStatus>(session?.status ?? 'planned');
  const [showErrors, setShowErrors] = useState(false);

  const dateError = /^\d{4}-\d{2}-\d{2}$/.test(date) ? '' : 'Укажите дату';
  const timeError = /^\d{2}:\d{2}$/.test(startTime) ? '' : 'Укажите время';
  const hasErrors = dateError !== '' || timeError !== '';

  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const mutationError = createMutation.isError || updateMutation.isError || deleteMutation.isError;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedLocation = location.trim();
    if (isEdit && session) {
      updateMutation.mutate(
        {
          id: session.id,
          patch: {
            date,
            startTime,
            durationMin,
            title: trimmedTitle === '' ? null : trimmedTitle,
            location: trimmedLocation === '' ? null : trimmedLocation,
            isOnline,
            status,
          },
        },
        { onSuccess: onClose },
      );
    } else {
      createMutation.mutate(
        {
          clientId,
          date,
          startTime,
          durationMin,
          title: trimmedTitle === '' ? null : trimmedTitle,
          location: trimmedLocation === '' ? null : trimmedLocation,
          isOnline,
        },
        { onSuccess: onClose },
      );
    }
  }

  function handleDelete() {
    if (!session) return;
    if (!window.confirm('Удалить занятие?')) return;
    deleteMutation.mutate(session.id, { onSuccess: onClose });
  }

  const inputClass =
    'w-full rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 flex max-h-[88vh] flex-col rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-bold text-ink">{isEdit ? 'Занятие' : 'Новое занятие'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-y-auto px-5 pt-1"
        >
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="session-date" className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Дата</span>
              <input
                id="session-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={showErrors && dateError !== ''}
                className={`${inputClass} [color-scheme:dark] ${
                  showErrors && dateError ? 'border-danger' : ''
                }`}
              />
              {showErrors && dateError && (
                <span className="text-[12px] text-danger">{dateError}</span>
              )}
            </label>
            <label htmlFor="session-time" className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Время</span>
              <input
                id="session-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-invalid={showErrors && timeError !== ''}
                className={`${inputClass} [color-scheme:dark] ${
                  showErrors && timeError ? 'border-danger' : ''
                }`}
              />
              {showErrors && timeError && (
                <span className="text-[12px] text-danger">{timeError}</span>
              )}
            </label>
          </div>

          <label htmlFor="session-title" className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Название</span>
            <input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Например, силовая тренировка"
              className={inputClass}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Длительность</span>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDurationMin(m)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    durationMin === m ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                  }`}
                >
                  {formatDuration(m)}
                </button>
              ))}
            </div>
          </div>

          <label htmlFor="session-location" className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Место</span>
            <input
              id="session-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              placeholder="Зал, адрес или ссылка"
              className={inputClass}
            />
          </label>

          <button
            type="button"
            onClick={() => setIsOnline((v) => !v)}
            className="flex items-center justify-between rounded-xl border border-line bg-chip px-3 py-2.5 text-left"
          >
            <span className="flex items-center gap-2 text-base text-ink">
              <Wifi size={18} strokeWidth={1.8} className="text-ink-muted" /> Онлайн-занятие
            </span>
            <span
              className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors ${
                isOnline ? 'bg-accent' : 'bg-card-elevated'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-bg transition-transform ${
                  isOnline ? 'translate-x-4' : ''
                }`}
              />
            </span>
          </button>

          {isEdit && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Статус</span>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STATUS_LABEL) as SessionStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      status === s ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mutationError && (
            <p className="text-sm text-ink-muted" role="alert">
              Не удалось сохранить. Попробуйте снова.
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded-2xl bg-accent py-3.5 text-[15px] font-bold text-accent-on active:opacity-90 disabled:opacity-50"
          >
            {pending ? '…' : isEdit ? 'Сохранить' : 'Запланировать'}
          </button>

          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="mb-1 flex items-center justify-center gap-2 rounded-2xl bg-card py-3.5 text-[14px] font-semibold text-ink active:bg-card-elevated disabled:opacity-50"
            >
              <Trash2 size={18} strokeWidth={1.8} className="text-danger" /> Удалить занятие
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
