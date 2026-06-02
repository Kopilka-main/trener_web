import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronRight, Pencil, Plus, X } from 'lucide-react';
import type {
  ExerciseResponse,
  WorkoutExerciseResponse,
  WorkoutResponse,
  WorkoutSetResponse,
} from '@trener/shared';
import {
  clientWorkoutQueryKey,
  useAddWorkoutExercise,
  useCompleteWorkout,
  useDeleteWorkout,
  useRemoveWorkoutExercise,
  useReorderWorkoutExercises,
  useStartWorkout,
  useUpdateSet,
  useWorkout,
} from '../api/client-workouts';

/** Запускает обновление DOM внутри View Transition (плавный морфинг), где доступно. */
function runWithTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => {
      flushSync(update);
    });
  } else {
    update();
  }
}

/** Оптимистично проставляет done у конкретного подхода. */
function withSetDone(w: WorkoutResponse, pos: number, idx: number, done: boolean): WorkoutResponse {
  return {
    ...w,
    exercises: w.exercises.map((ex) =>
      ex.position !== pos
        ? ex
        : { ...ex, sets: ex.sets.map((s) => (s.setIndex === idx ? { ...s, done } : s)) },
    ),
  };
}
import { useExercises } from '../api/exercises';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { HoldToDelete } from '../components/HoldToDelete';
import { SortableList } from '../components/SortableList';

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${String(h)}:${two(mm)}:${two(sec)}` : `${String(m)}:${two(sec)}`;
}

/** Секунды, прошедшие с момента startedAt (тикает раз в секунду). */
function useElapsed(startedAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return 0;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function ActiveWorkoutPage() {
  const { id = '', wid = '' } = useParams<{ id: string; wid: string }>();
  const workout = useWorkout(id, wid);
  const backTo = `/clients/${id}/workouts`;

  if (workout.isPending) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Тренировка" back={backTo} />
        <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  if (workout.isError || !workout.data) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Тренировка" back={backTo} />
        <p className="px-5 py-6 text-sm text-ink-muted" role="alert">
          Не удалось загрузить тренировку.
        </p>
      </div>
    );
  }

  const w = workout.data;
  if (w.status === 'draft') return <DraftView clientId={id} workout={w} backTo={backTo} />;
  if (w.status === 'active') return <ActiveView clientId={id} workout={w} backTo={backTo} />;
  return <SummaryView workout={w} backTo={backTo} />;
}

/** Из дефолтов упражнения формируем один план-подход. */
function buildPlannedSet(ex: ExerciseResponse): {
  plannedReps: number | null;
  plannedWeightKg: number | null;
  plannedTimeSec: number | null;
  plannedRestSec: number;
} {
  return {
    plannedReps: ex.defaultReps,
    plannedWeightKg: ex.defaultWeightKg,
    plannedTimeSec: ex.defaultTimeSec,
    plannedRestSec: ex.restSec,
  };
}

/* ---------- DRAFT: план + «Начать» + drag/add/remove + удалить тренировку ---------- */

function DraftView({
  clientId,
  workout,
  backTo,
}: {
  clientId: string;
  workout: WorkoutResponse;
  backTo: string;
}) {
  const navigate = useNavigate();
  const start = useStartWorkout(clientId, workout.id);
  const remove = useDeleteWorkout(clientId);
  const reorder = useReorderWorkoutExercises(clientId, workout.id);
  const add = useAddWorkoutExercise(clientId, workout.id);
  const removeExercise = useRemoveWorkoutExercise(clientId, workout.id);
  const [adding, setAdding] = useState(false);

  const items = workout.exercises.map((ex) => ({ ...ex, id: `ex-${String(ex.position)}` }));

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title={workout.name}
        back={backTo}
        right={
          <HoldToDelete
            label="Удерживайте, чтобы удалить тренировку"
            onDelete={() =>
              remove.mutate(workout.id, {
                onSuccess: () => void navigate(backTo, { replace: true }),
              })
            }
          />
        }
      />

      <div className="flex flex-1 flex-col gap-4 px-5 pb-28 pt-2">
        <p className="text-sm text-ink-muted">План тренировки. Нажмите «Начать», чтобы провести.</p>

        <SortableList
          items={items}
          onReorder={(next) => reorder.mutate(next.map((it) => it.position))}
          renderItem={(ex) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px] font-semibold text-ink">
                  {ex.exerciseName}
                </span>
                <HoldToDelete onDelete={() => removeExercise.mutate(ex.position)} />
              </div>
              {ex.sets.map((set) => (
                <span
                  key={set.setIndex}
                  className="font-[family-name:var(--font-mono)] text-[19px] tabular-nums text-ink-muted"
                >
                  {plannedText(set)}
                </span>
              ))}
            </div>
          )}
        />

        <AddExerciseButton onClick={() => setAdding(true)} />
      </div>

      <div className="sticky bottom-0 mt-auto bg-bg px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <Button
          className="w-full"
          disabled={start.isPending || workout.exercises.length === 0}
          onClick={() =>
            start.mutate(undefined, {
              onSuccess: () => void navigate(`/clients/${clientId}/workouts/${workout.id}`),
            })
          }
        >
          Начать тренировку
        </Button>
      </div>

      {adding && (
        <ExercisePickerSheet
          pending={add.isPending}
          onClose={() => setAdding(false)}
          onPick={(ex) =>
            add.mutate(
              { exerciseId: ex.id, sets: [buildPlannedSet(ex)] },
              { onSuccess: () => setAdding(false) },
            )
          }
        />
      )}
    </div>
  );
}

/* ---------- ACTIVE: чек-лист подходов + таймер отдыха + drag/add/remove + завершение ---------- */

function ActiveView({
  clientId,
  workout,
  backTo,
}: {
  clientId: string;
  workout: WorkoutResponse;
  backTo: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateSet = useUpdateSet(clientId, workout.id);
  const complete = useCompleteWorkout(clientId, workout.id);
  const reorder = useReorderWorkoutExercises(clientId, workout.id);
  const add = useAddWorkoutExercise(clientId, workout.id);
  const removeExercise = useRemoveWorkoutExercise(clientId, workout.id);
  const elapsed = useElapsed(workout.startedAt);

  const finishWorkout = () =>
    complete.mutate(
      { durationSec: elapsed > 0 ? elapsed : null, rpe: null, trainerNote: null },
      { onSuccess: () => void navigate(backTo, { replace: true }) },
    );

  const [editing, setEditing] = useState<string | null>(null);
  const [rest, setRest] = useState<{ key: string; sec: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [doneExpanded, setDoneExpanded] = useState(false);

  const counters = useMemo(() => {
    const all = workout.exercises.flatMap((e) => e.sets);
    return { done: all.filter((s) => s.done).length, total: all.length };
  }, [workout]);

  // Завершённые подходы собираются в коллектор сверху; невыполненные — в списке.
  const isDoneEx = (ex: WorkoutExerciseResponse) =>
    ex.sets.length > 0 && ex.sets.every((s) => s.done);
  const completed = workout.exercises.filter(isDoneEx);
  const pending = workout.exercises.filter((ex) => !isDoneEx(ex));
  const pendingItems = pending.map((ex) => ({ ...ex, id: `ex-${String(ex.position)}` }));
  // Свёрнуто видно только последний завершённый; развёрнуто — все.
  const visibleCompleted = doneExpanded ? completed : completed.slice(-1);

  function toggleDone(ex: WorkoutExerciseResponse, set: WorkoutSetResponse) {
    const nextDone = !set.done;
    // Оптимистично обновляем кэш внутри View Transition — карточки плавно уезжают вверх.
    runWithTransition(() => {
      qc.setQueryData(clientWorkoutQueryKey(clientId, workout.id), (prev?: WorkoutResponse) =>
        prev ? withSetDone(prev, ex.position, set.setIndex, nextDone) : prev,
      );
    });
    updateSet.mutate({ pos: ex.position, idx: set.setIndex, body: { done: nextDone } });
    if (nextDone && set.plannedRestSec && set.plannedRestSec > 0) {
      setRest({ key: `${String(ex.position)}-${String(set.setIndex)}`, sec: set.plannedRestSec });
    }
  }

  function saveFact(
    ex: WorkoutExerciseResponse,
    set: WorkoutSetResponse,
    patch: {
      actualReps: number | null;
      actualWeightKg: number | null;
      actualTimeSec: number | null;
    },
  ) {
    updateSet.mutate(
      { pos: ex.position, idx: set.setIndex, body: { ...patch, done: true } },
      {
        onSuccess: () => {
          setEditing(null);
          if (set.plannedRestSec && set.plannedRestSec > 0) {
            setRest({
              key: `${String(ex.position)}-${String(set.setIndex)}`,
              sec: set.plannedRestSec,
            });
          }
        },
      },
    );
  }

  const cardBody = (ex: WorkoutExerciseResponse) => (
    <ul
      className="flex flex-col gap-2"
      style={{ viewTransitionName: `wex-${String(ex.position)}` }}
    >
      {ex.sets.map((set) => {
        const key = `${String(ex.position)}-${String(set.setIndex)}`;
        const isEditing = editing === key;
        const hasFact =
          set.actualReps !== null || set.actualWeightKg !== null || set.actualTimeSec !== null;
        return (
          <li key={key} className="flex flex-col gap-2 px-0.5 py-1">
            <span className="truncate text-[14px] font-semibold text-ink">{ex.exerciseName}</span>
            {isEditing ? (
              <SetEditor
                set={set}
                onCancel={() => setEditing(null)}
                onSave={(patch) => saveFact(ex, set, patch)}
                onDelete={() => {
                  setEditing(null);
                  removeExercise.mutate(ex.position);
                }}
              />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="font-[family-name:var(--font-mono)] text-[19px] tabular-nums text-ink-muted">
                  {hasFact ? actualText(set) : plannedText(set)}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label="Изменить факт"
                    onClick={() => setEditing(key)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-card-elevated text-ink-muted active:scale-95"
                  >
                    <Pencil size={16} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    aria-label={set.done ? 'Снять отметку' : 'Отметить выполненным'}
                    onClick={() => toggleDone(ex, set)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full active:scale-95 ${
                      set.done ? 'bg-accent text-accent-on' : 'bg-card-elevated text-ink-muted'
                    }`}
                  >
                    <Check size={18} strokeWidth={2.6} />
                  </button>
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title={workout.name} back={backTo} />

      <div className="flex flex-1 flex-col gap-3 px-5 pb-28 pt-2">
        {/* Сводка; в центре — отдых (во время отдыха) либо завершение удержанием. */}
        <div className="tile-shadow-primary flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <span className="flex shrink-0 flex-col">
            <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.06em] opacity-70">
              Прошло
            </span>
            <span className="text-2xl font-bold tabular-nums leading-tight">
              {formatDuration(elapsed)}
            </span>
          </span>

          {rest ? (
            <RestTimer
              seconds={rest.sec}
              onDone={() => setRest(null)}
              onSkip={() => setRest(null)}
            />
          ) : (
            <HoldComplete pending={complete.isPending} onComplete={finishWorkout} />
          )}

          <span className="flex shrink-0 flex-col text-right">
            <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.06em] opacity-70">
              Подходов
            </span>
            <span className="text-xl font-bold tabular-nums leading-tight">
              {counters.done} / {counters.total}
            </span>
          </span>
        </div>

        {/* Коллектор завершённых: показывается всегда; свёрнуто — последний, развёрнуто — все. */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setDoneExpanded((v) => !v)}
            className="flex items-center justify-between gap-2 rounded-xl bg-card px-3.5 py-3"
          >
            <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              Завершено · {completed.length}
            </span>
            <ChevronDown
              size={18}
              className={`text-ink-muted transition-transform ${doneExpanded ? 'rotate-180' : ''}`}
            />
          </button>
          {visibleCompleted.map((ex) => (
            <div key={ex.position} className="shelf rounded-2xl px-3 py-1 opacity-80">
              {cardBody(ex)}
            </div>
          ))}
        </div>

        {pendingItems.length > 0 && (
          <SortableList
            items={pendingItems}
            onReorder={(next) =>
              reorder.mutate([
                ...completed.map((c) => c.position),
                ...next.map((it) => it.position),
              ])
            }
            renderItem={(ex) => cardBody(ex)}
          />
        )}

        <AddExerciseButton onClick={() => setAdding(true)} />

        {/* Все подходы выполнены — большая кнопка завершения. */}
        {workout.exercises.length > 0 && pending.length === 0 && (
          <HoldComplete variant="block" pending={complete.isPending} onComplete={finishWorkout} />
        )}
      </div>

      {adding && (
        <ExercisePickerSheet
          pending={add.isPending}
          onClose={() => setAdding(false)}
          onPick={(ex) =>
            add.mutate(
              { exerciseId: ex.id, sets: [buildPlannedSet(ex)] },
              { onSuccess: () => setAdding(false) },
            )
          }
        />
      )}
    </div>
  );
}

/* ---------- COMPLETED: сводка только для чтения ---------- */

function SummaryView({ workout, backTo }: { workout: WorkoutResponse; backTo: string }) {
  const done = workout.exercises.flatMap((e) => e.sets).filter((s) => s.done).length;
  const total = workout.exercises.flatMap((e) => e.sets).length;

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title={workout.name} back={backTo} />

      <div className="flex flex-1 flex-col gap-4 px-5 pb-8 pt-2">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Подходов" value={`${String(done)}/${String(total)}`} />
          <Stat
            label="Время"
            value={workout.durationSec ? formatDuration(workout.durationSec) : '—'}
          />
          <Stat label="RPE" value={workout.rpe ? `${String(workout.rpe)}/10` : '—'} />
        </div>

        {workout.trainerNote && (
          <section className="flex flex-col gap-1.5">
            <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
              Заметка тренера
            </h2>
            <p className="whitespace-pre-wrap rounded-2xl bg-card p-4 text-[14px] leading-relaxed text-ink">
              {workout.trainerNote}
            </p>
          </section>
        )}

        {workout.exercises.map((ex) => (
          <div key={ex.position} className="flex flex-col gap-2 rounded-2xl bg-card p-4">
            <h2 className="text-[15px] font-semibold text-ink">{ex.exerciseName}</h2>
            <ul className="flex flex-col gap-1">
              {ex.sets.map((set) => (
                <li
                  key={set.setIndex}
                  className="flex items-center justify-between gap-2 font-[family-name:var(--font-mono)] text-[13px]"
                >
                  <span className="text-ink-muted">Подход {set.setIndex + 1}</span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="text-ink-muted">{plannedText(set)}</span>
                    <span className="text-ink-mutedxl">→</span>
                    <span className={set.done ? 'text-accent' : 'text-ink-muted'}>
                      {actualText(set)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-card px-2 py-3">
      <span className="text-xl font-bold tabular-nums text-ink">{value}</span>
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </span>
    </div>
  );
}

/* ---------- Кнопка добавления упражнения ---------- */

function AddExerciseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3.5 text-[13px] font-semibold text-ink-muted active:bg-card-elevated"
    >
      <Plus size={16} strokeWidth={2.2} /> Добавить упражнение
    </button>
  );
}

/* ---------- Лист выбора упражнения из каталога ---------- */

function ExercisePickerSheet({
  pending,
  onClose,
  onPick,
}: {
  pending: boolean;
  onClose: () => void;
  onPick: (exercise: ExerciseResponse) => void;
}) {
  const exercises = useExercises();
  const [query, setQuery] = useState('');
  const list = exercises.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return list;
    return list.filter((e) => e.name.toLowerCase().includes(q));
  }, [list, query]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 flex max-h-[75vh] flex-col rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-bold text-ink">Добавить упражнение</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-5 pb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск упражнения"
            className="w-full rounded-2xl bg-card px-4 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-muted"
          />
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto px-5 pt-1">
          {exercises.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}
          {exercises.isError && (
            <p className="text-sm text-ink-muted" role="alert">
              Не удалось загрузить упражнения.
            </p>
          )}
          {exercises.isSuccess && filtered.length === 0 && (
            <p className="text-sm text-ink-muted">Ничего не найдено.</p>
          )}
          {filtered.map((ex) => (
            <button
              key={ex.id}
              type="button"
              disabled={pending}
              onClick={() => onPick(ex)}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left transition-colors active:bg-card-elevated disabled:opacity-50"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold text-ink">{ex.name}</span>
                <span className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                  {ex.category}
                  {ex.subgroup ? ` · ${ex.subgroup}` : ''}
                </span>
              </span>
              <ChevronRight size={16} className="tile-chevron shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Таймер отдыха ---------- */

function RestTimer({
  seconds,
  onDone,
  onSkip,
}: {
  seconds: number;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setLeft(seconds);
    const id = window.setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          doneRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds]);

  const progress = seconds > 0 ? left / seconds : 0;
  const C = 2 * Math.PI * 16;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/10 px-2 py-1">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
        <svg aria-hidden viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(11,12,16,0.25)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="var(--color-accent-on)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold tabular-nums text-accent-on">
          {left}
        </span>
      </span>
      <span className="truncate text-[13px] font-semibold text-accent-on">Отдых</span>
      <button
        type="button"
        aria-label="Отменить отдых"
        onClick={onSkip}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-accent-on active:scale-90"
      >
        <X size={18} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/* ---------- Редактор факта подхода ---------- */

function SetEditor({
  set,
  onCancel,
  onSave,
  onDelete,
}: {
  set: WorkoutSetResponse;
  onCancel: () => void;
  onSave: (patch: {
    actualReps: number | null;
    actualWeightKg: number | null;
    actualTimeSec: number | null;
  }) => void;
  onDelete: () => void;
}) {
  const showReps = set.plannedReps !== null || set.plannedWeightKg !== null;
  const showWeight = set.plannedWeightKg !== null;
  const showTime = set.plannedTimeSec !== null;
  const [reps, setReps] = useState(String(set.actualReps ?? set.plannedReps ?? ''));
  const [weight, setWeight] = useState(String(set.actualWeightKg ?? set.plannedWeightKg ?? ''));
  const [time, setTime] = useState(String(set.actualTimeSec ?? set.plannedTimeSec ?? ''));

  const num = (s: string): number | null => {
    const t = s.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const repsShown = showReps || (!showWeight && !showTime);

  return (
    <div className="flex items-center gap-2">
      {/* Раздельные поля ввода (без единиц): 8 × 60. */}
      <div className="flex flex-1 items-center gap-2">
        {repsShown && <NumBox value={reps} onChange={setReps} ariaLabel="повторы" />}
        {showWeight && (
          <>
            <span className="font-[family-name:var(--font-mono)] text-[14px] text-ink-muted">
              ×
            </span>
            <NumBox value={weight} onChange={setWeight} ariaLabel="вес" />
          </>
        )}
        {showTime && (
          <>
            {repsShown && (
              <span className="font-[family-name:var(--font-mono)] text-[14px] text-ink-muted">
                ·
              </span>
            )}
            <NumBox value={time} onChange={setTime} ariaLabel="секунды" />
          </>
        )}
      </div>
      <button
        type="button"
        aria-label="Сохранить подход"
        onClick={() =>
          onSave({
            actualReps: repsShown ? num(reps) : null,
            actualWeightKg: showWeight ? num(weight) : null,
            actualTimeSec: showTime ? num(time) : null,
          })
        }
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-on active:scale-90"
      >
        <Check size={18} strokeWidth={2.8} />
      </button>
      <button
        type="button"
        aria-label="Отменить"
        onClick={onCancel}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-elevated text-ink-muted active:scale-90"
      >
        <X size={18} strokeWidth={2.2} />
      </button>
      <HoldToDelete
        icon="trash"
        size="sm"
        label="Удерживайте, чтобы удалить упражнение"
        onDelete={onDelete}
      />
    </div>
  );
}

/** Отдельное числовое поле ввода в рамке. */
function NumBox({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <label className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-line bg-chip px-2 focus-within:border-accent">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="w-full min-w-0 bg-transparent text-center font-[family-name:var(--font-mono)] text-[15px] tabular-nums text-ink outline-none"
      />
    </label>
  );
}

/* ---------- Завершение удержанием ---------- */

const HOLD_COMPLETE_MS = 1000;

function HoldComplete({
  pending,
  onComplete,
  variant = 'pill',
}: {
  pending: boolean;
  onComplete: () => void;
  variant?: 'pill' | 'block';
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  function clear() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }
  function start() {
    if (pending) return;
    setHolding(true);
    clear();
    timer.current = window.setTimeout(() => {
      setHolding(false);
      timer.current = null;
      onComplete();
    }, HOLD_COMPLETE_MS);
  }
  function cancel() {
    clear();
    setHolding(false);
  }

  const C = 2 * Math.PI * 16;

  return (
    <button
      type="button"
      aria-label="Удерживайте, чтобы завершить"
      disabled={pending}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex touch-none select-none items-center gap-2 disabled:opacity-50 ${
        variant === 'block'
          ? 'h-12 w-full justify-center rounded-2xl bg-accent text-accent-on'
          : 'h-10 rounded-full bg-black/10 px-5 text-accent-on'
      }`}
    >
      {/* Кольцо-прогресс: заполняется по часовой за HOLD_COMPLETE_MS. */}
      <span aria-hidden className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            opacity="0.25"
          />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={holding ? 0 : C}
            style={{
              transitionProperty: 'stroke-dashoffset',
              transitionTimingFunction: 'linear',
              transitionDuration: holding ? `${String(HOLD_COMPLETE_MS)}ms` : '160ms',
            }}
          />
        </svg>
      </span>
      <span className="text-[14px] font-normal">Завершить</span>
    </button>
  );
}

/* ---------- helpers ---------- */

function plannedText(set: WorkoutSetResponse): string {
  const parts: string[] = [];
  if (set.plannedReps !== null) parts.push(`${String(set.plannedReps)}`);
  if (set.plannedWeightKg !== null) parts.push(`× ${String(set.plannedWeightKg)} кг`);
  if (set.plannedTimeSec !== null) parts.push(`${String(set.plannedTimeSec)} с`);
  return parts.join(' ') || '—';
}

function actualText(set: WorkoutSetResponse): string {
  const parts: string[] = [];
  if (set.actualReps !== null) parts.push(`${String(set.actualReps)}`);
  if (set.actualWeightKg !== null) parts.push(`× ${String(set.actualWeightKg)} кг`);
  if (set.actualTimeSec !== null) parts.push(`${String(set.actualTimeSec)} с`);
  return parts.join(' ') || '—';
}
