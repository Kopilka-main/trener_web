import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Timer, Wifi, X } from 'lucide-react';
import type { SessionResponse } from '@trener/shared';
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
  parseISO,
  sameDay,
  startOfWeek,
  timeToMin,
  toISODate,
  weekDates,
  weekdayMon,
} from '../lib/calendar';

export type CalendarView = 'day' | 'week' | 'month';

/** Высота одного часа в day-сетке (px). */
const DAY_HOUR_H = 56;
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
  /** Недельная лента запрашивает диапазон занятий под видимое окно (скользящее окно). */
  onRangeChange?: (from: Date, to: Date) => void;
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
  onRangeChange,
  anchor: anchorProp,
  onAnchorChange,
}: SessionsCalendarProps) {
  const [view, setView] = useState<CalendarView>(defaultView);
  const [anchorState, setAnchorState] = useState<Date>(() => anchorProp ?? new Date());
  const anchor = anchorProp ?? anchorState;
  // Верхняя видимая неделя в недельной ленте — для подписи периода (меняется при
  // прокрутке и навигации). Отделена от anchor, чтобы прокрутка не дёргала загрузку.
  const [weekTop, setWeekTop] = useState<Date>(() => startOfWeek(anchorProp ?? new Date()));
  const setAnchor = (next: Date) => {
    if (onAnchorChange) onAnchorChange(next);
    if (anchorProp === undefined) setAnchorState(next);
    setWeekTop(startOfWeek(next));
  };

  const shift = (dir: -1 | 1) => {
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === 'week') setAnchor(addDays(anchor, dir * 14));
    else setAnchor(addMonths(anchor, dir));
  };

  const periodLabel = useMemo(() => {
    if (view === 'day') {
      return `${DAY_FULL[weekdayMon(anchor)]}, ${String(anchor.getDate())} ${MONTH_GEN[anchor.getMonth()]}`;
    }
    if (view === 'week') {
      const a = weekTop;
      const b = addDays(a, 13);
      return a.getMonth() === b.getMonth()
        ? `${String(a.getDate())}–${String(b.getDate())} ${MONTH_GEN[b.getMonth()]}`
        : `${String(a.getDate())} ${MONTH_GEN[a.getMonth()]} – ${String(b.getDate())} ${MONTH_GEN[b.getMonth()]}`;
    }
    return `${MONTH_FULL[anchor.getMonth()]} ${String(anchor.getFullYear())}`;
  }, [view, anchor, weekTop]);

  const pickDay = (d: Date) => {
    setAnchor(d);
    setView('day');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-16">
      {/* Шапка периода: ‹ / подпись / › + «Сегодня» */}
      <div className="flex items-center gap-1 px-2 pb-2">
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
          onVisibleWeekChange={setWeekTop}
          onRangeChange={onRangeChange ?? (() => {})}
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

// --- Цвет блока занятия (кислотные тона) ---
// Согласованное клиентом (confirmed) — зелёный (лайм), отдельный статус «Согласовано»:
//   применяется и к запланированным, и к уже проведённым (клиент подтвердил факт).
// cancelled — перечёркнут + opacity-50; проведённое без согласования — приглушённое;
// отказ клиента — красный; ждёт ответа — оранжевый.
function tileClasses(s: SessionResponse): string {
  if (s.status === 'cancelled') return 'bg-card-elevated text-ink-muted line-through opacity-50';
  if (s.clientConfirmation === 'confirmed') return 'bg-[#caff3a] text-[#0b0c10]';
  if (s.status === 'completed') return 'bg-card-elevated text-ink';
  if (s.clientConfirmation === 'declined') return 'bg-[#ff5a5a] text-[#1a0606]';
  return 'bg-[#ffab2e] text-[#1a1200]';
}

/** Индикатор ответа клиента: ✓ подтвердил, ✕ отклонил, ничего — ждёт ответа. */
/**
 * Бейдж состояния связи с клиентом (кружок с иконкой):
 *  • подтверждено клиентом → галочка, акцент;
 *  • отправлено клиенту (есть тренировка), ждёт ответа → цепь, акцент;
 *  • отклонено клиентом → разорванная цепь, коралл;
 *  • не отправлено (тренировка не прикреплена) → разорванная цепь, серая.
 */
interface StateInfo {
  Icon: typeof Timer;
  color: string;
  label: string;
}

/** Состояние подтверждения занятия клиентом — иконка, цвет и подпись. */
function stateInfo(session: SessionResponse): StateInfo {
  if (session.clientConfirmation === 'confirmed') {
    return { Icon: Check, color: 'var(--color-accent-text)', label: 'Клиент подтвердил' };
  }
  if (session.clientConfirmation === 'declined') {
    return { Icon: X, color: 'var(--color-danger)', label: 'Клиент отклонил' };
  }
  return { Icon: Timer, color: '#000000', label: 'Ждём подтверждения' };
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

  // Счётчики по дате и подтверждению клиента: pending / confirmed / declined.
  const counts = useMemo(() => {
    const map = new Map<string, { pending: number; confirmed: number; declined: number }>();
    for (const s of sessions) {
      const c = map.get(s.date) ?? { pending: 0, confirmed: 0, declined: 0 };
      if (s.clientConfirmation === 'confirmed') c.confirmed += 1;
      else if (s.clientConfirmation === 'declined') c.declined += 1;
      else c.pending += 1;
      map.set(s.date, c);
    }
    return map;
  }, [sessions]);

  return (
    <div className="flex-1 overflow-y-auto px-2 pt-1">
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
          const hasSessions = c ? c.pending + c.confirmed + c.declined > 0 : false;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPickDay(d)}
              className={`relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl bg-card active:bg-card-elevated ${
                today ? 'ring-2 ring-accent' : ''
              } ${inMonth ? '' : 'opacity-40'}`}
            >
              {/* Есть занятия в этот день → четвертькруга акцентом в правом верхнем углу. */}
              {hasSessions && (
                <span
                  aria-hidden
                  className="absolute right-0 top-0 h-3 w-3 rounded-bl-full bg-accent"
                />
              )}
              <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold tabular-nums text-ink">
                {d.getDate()}
              </span>
              {c && c.pending + c.confirmed + c.declined > 0 ? (
                <span className="flex items-center gap-1 font-[family-name:var(--font-mono)] text-[10px] font-bold leading-none tabular-nums">
                  {c.pending > 0 && <span className="text-ink-mutedxl">{c.pending}</span>}
                  {c.confirmed > 0 && <span className="text-accent-text">{c.confirmed}</span>}
                  {c.declined > 0 && <span className="text-danger">{c.declined}</span>}
                </span>
              ) : (
                <span className="h-2.5" aria-hidden />
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
      <div className="flex px-2 pt-3">
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
            const state = stateInfo(s);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
                className={`absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-xl px-2.5 py-1.5 text-left ${tileClasses(s)}`}
                style={{ top, height }}
              >
                <div className="flex items-center gap-1.5 pr-4">
                  {s.isOnline && <Wifi size={12} strokeWidth={2.2} className="shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                    {renderLabel(s)}
                  </span>
                </div>
                {/* Описание статуса — сразу под названием. */}
                {height >= 50 && (
                  <div className="truncate pr-4 text-[10px] font-semibold opacity-90">
                    {state.label}
                  </div>
                )}
                <div className="truncate pr-5 font-[family-name:var(--font-mono)] text-[11px] opacity-80">
                  {[
                    `${s.startTime}–${endTime(s.startTime, s.durationMin)}`,
                    s.isOnline ? 'Online' : s.location,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {/* Статус — иконка на белом четвертькруге с чёрной обводкой в правом нижнем углу. */}
                <span
                  aria-label={state.label}
                  title={state.label}
                  className="absolute bottom-0 right-0 flex h-[20px] w-[20px] items-end justify-end rounded-tl-full border-l border-t border-black bg-white pb-px pr-px"
                  style={{ color: state.color }}
                >
                  <state.Icon size={12} strokeWidth={2.8} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </ScrollableGrid>
  );
}

// Параметры скользящего окна недель: стартовое окно, докуп/очистка чанками, потолок.
const WEEK_INIT_BEFORE = 4; // недель до опорной в стартовом окне
const WEEK_INIT_TOTAL = 20; // всего недель в стартовом окне
const WEEK_CHUNK = 6; // сколько недель добавляем/убираем за раз у края
const WEEK_MAX = 44; // максимум недель в DOM (старые с дальнего края выкидываем)
const WEEK_EDGE_PX = 800; // близость к краю, при которой подгружаем ещё

/** Окно недель: `total` недель, из них `before` до `start` (start — в позиции before). */
function buildWeekWindow(start: Date, before: number, total: number): Date[] {
  return Array.from({ length: total }, (_, i) => addDays(start, (i - before) * 7));
}

/**
 * Недельный вид — бесконечная вертикальная лента недель (как в iPhone), скользящее
 * окно: при приближении к краю достраиваем недели и выкидываем дальние, удерживая
 * позицию прокрутки. Под текущее окно догружаются занятия (onRangeChange). Каждая
 * неделя — строка из 7 колонок-дней со стопкой карточек (цвет — по статусу).
 * Опорная неделя (anchor) прижимается к верху при ‹/› и «Сегодня».
 * Тап по числу — открыть день; тап по пустому месту в колонке — добавить занятие.
 */
function WeekView({
  anchor,
  sessions,
  onPick,
  onPickDay,
  onSlot,
  renderLabel,
  onVisibleWeekChange,
  onRangeChange,
}: {
  anchor: Date;
  sessions: SessionResponse[];
  onPick: (s: SessionResponse) => void;
  onPickDay: (d: Date) => void;
  onSlot: (date: Date, hour: number) => void;
  renderLabel: (s: SessionResponse) => string;
  onVisibleWeekChange: (weekStart: Date) => void;
  onRangeChange: (from: Date, to: Date) => void;
}) {
  const now = new Date();
  const anchorIso = toISODate(startOfWeek(anchor));

  const [weeks, setWeeks] = useState<Date[]>(() =>
    buildWeekWindow(startOfWeek(anchor), WEEK_INIT_BEFORE, WEEK_INIT_TOTAL),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const ticking = useRef(false);
  const lastReported = useRef('');
  // Что делать после изменения окна: прыгнуть к опорной неделе или удержать видимую.
  const scrollToAnchor = useRef(false);
  const restore = useRef<{ iso: string; offset: number } | null>(null);

  // Верхняя видимая неделя (ISO) — ближайшая к линии под липкой шапкой.
  function topWeekIso(): string | null {
    const c = containerRef.current;
    if (!c) return null;
    const line = c.getBoundingClientRect().top + 24; // под липкой шапкой (scroll-pt-6 = 24px)
    let best: string | null = null;
    let bestDist = Infinity;
    rowRefs.current.forEach((el, iso) => {
      const dist = Math.abs(el.getBoundingClientRect().top - line);
      if (dist < bestDist) {
        bestDist = dist;
        best = iso;
      }
    });
    return best;
  }

  // Запомнить положение видимой недели, чтобы удержать его после перестройки окна.
  function captureAnchorRow() {
    const c = containerRef.current;
    if (!c) return;
    const iso = topWeekIso();
    if (!iso) return;
    const el = rowRefs.current.get(iso);
    if (!el) return;
    restore.current = {
      iso,
      offset: el.getBoundingClientRect().top - c.getBoundingClientRect().top,
    };
  }

  // Смена опорной недели (‹/›, «Сегодня», возврат из дня) — окно вокруг неё + прыжок.
  useEffect(() => {
    setWeeks(buildWeekWindow(parseISO(anchorIso), WEEK_INIT_BEFORE, WEEK_INIT_TOTAL));
    scrollToAnchor.current = true;
    lastReported.current = anchorIso;
  }, [anchorIso]);

  // После любого изменения окна удерживаем позицию (прыжок к опорной / привязка к видимой).
  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    if (scrollToAnchor.current) {
      scrollToAnchor.current = false;
      restore.current = null;
      rowRefs.current.get(anchorIso)?.scrollIntoView({ block: 'start', behavior: 'auto' });
    } else if (restore.current) {
      const { iso, offset } = restore.current;
      restore.current = null;
      const el = rowRefs.current.get(iso);
      if (el) {
        const cur = el.getBoundingClientRect().top - c.getBoundingClientRect().top;
        c.scrollTop += cur - offset;
      }
    }
  }, [weeks, anchorIso]);

  // Догружаем занятия под текущее окно (диапазон [первая неделя .. последняя+6 дней]).
  const firstIso = toISODate(weeks[0] ?? now);
  const lastIso = toISODate(weeks[weeks.length - 1] ?? now);
  // onRangeChange — стабильный setState из родителя; реагируем только на смену окна.
  useEffect(() => {
    onRangeChange(parseISO(firstIso), addDays(parseISO(lastIso), 6));
  }, [firstIso, lastIso]);

  function onScroll() {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      ticking.current = false;
      const c = containerRef.current;
      if (!c) return;

      // Подпись периода — по верхней видимой неделе.
      const iso = topWeekIso();
      if (iso && iso !== lastReported.current) {
        lastReported.current = iso;
        onVisibleWeekChange(parseISO(iso));
      }

      // Края: достраиваем недели и выкидываем дальние (с удержанием позиции).
      if (c.scrollTop < WEEK_EDGE_PX) {
        captureAnchorRow();
        setWeeks((prev) => {
          const first = prev[0];
          if (!first) return prev;
          let next = [...buildWeekWindow(addDays(first, -WEEK_CHUNK * 7), 0, WEEK_CHUNK), ...prev];
          if (next.length > WEEK_MAX) next = next.slice(0, WEEK_MAX);
          return next;
        });
      } else if (c.scrollHeight - c.clientHeight - c.scrollTop < WEEK_EDGE_PX) {
        captureAnchorRow();
        setWeeks((prev) => {
          const last = prev[prev.length - 1];
          if (!last) return prev;
          let next = [...prev, ...buildWeekWindow(addDays(last, 7), 0, WEEK_CHUNK)];
          if (next.length > WEEK_MAX) next = next.slice(next.length - WEEK_MAX);
          return next;
        });
      }
    });
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="flex-1 snap-y snap-mandatory overflow-y-auto scroll-pt-6 px-2 pb-24"
    >
      {/* Дни недели — липкая шапка */}
      <div className="sticky top-0 z-30 grid grid-cols-7 border-b border-line bg-bg py-1">
        {DAY_SHORT.map((n) => (
          <div key={n} className="text-center text-[10px] font-semibold text-ink-muted">
            {n}
          </div>
        ))}
      </div>

      {weeks.map((ws) => {
        const wsIso = toISODate(ws);
        const dates = weekDates(ws);
        return (
          <div
            key={wsIso}
            ref={(el) => {
              if (el) rowRefs.current.set(wsIso, el);
              else rowRefs.current.delete(wsIso);
            }}
            className="snap-start border-b border-line"
          >
            {/* Числа недели */}
            <div className="grid grid-cols-7">
              {dates.map((d) => {
                const today = sameDay(d, now);
                return (
                  <button
                    key={toISODate(d)}
                    type="button"
                    onClick={() => onPickDay(d)}
                    className="flex justify-center"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full font-[family-name:var(--font-mono)] text-[12px] font-bold tabular-nums ${
                        today ? 'bg-accent text-accent-on' : 'text-ink'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Колонки-дни: растягиваются до самой высокой в строке */}
            <div className="grid min-h-[40vh] grid-cols-7">
              {dates.map((d) => {
                const items = sessionsOf(sessions, d);
                const today = sameDay(d, now);
                return (
                  <div
                    key={toISODate(d)}
                    className={`flex flex-col gap-1 px-0.5 pt-1 ${today ? 'bg-card/40' : ''}`}
                  >
                    {items.map((s) => (
                      <WeekCard
                        key={s.id}
                        session={s}
                        label={renderLabel(s)}
                        onClick={() => onPick(s)}
                      />
                    ))}
                    {/* Пустая область колонки — добавить занятие в этот день */}
                    <button
                      type="button"
                      onClick={() => onSlot(d, 9)}
                      aria-label={`Добавить занятие ${DAY_SHORT[weekdayMon(d)]} ${String(d.getDate())}`}
                      className="min-h-[36px] flex-1 rounded-lg active:bg-card-elevated/40"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Карточка занятия в недельной колонке: название (до 2 строк) + время начала. */
function WeekCard({
  session,
  label,
  onClick,
}: {
  session: SessionResponse;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`overflow-hidden rounded-lg px-1.5 py-1 text-left ${tileClasses(session)}`}
    >
      <div className="flex items-start gap-0.5">
        {session.isOnline && <Wifi size={10} strokeWidth={2.4} className="mt-px shrink-0" />}
        <span className="line-clamp-2 break-words text-[11px] font-semibold leading-[1.15]">
          {label}
        </span>
      </div>
      <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[10px] leading-none tabular-nums opacity-80">
        {session.startTime}
      </div>
    </button>
  );
}
