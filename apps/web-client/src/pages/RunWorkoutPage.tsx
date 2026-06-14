import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronLeft, Dumbbell, Info, Pencil, Plus, X } from 'lucide-react';
import type {
  ExerciseResponse,
  UpdateSetRequest,
  WorkoutExerciseResponse,
  WorkoutResponse,
  WorkoutSetResponse,
} from '@trener/shared';
import { useClientExercises } from '../api/exercises';
import {
  clientWorkoutQueryKey,
  useAddWorkoutExercise,
  useClientWorkout,
  useClientWorkouts,
  useCompleteWorkout,
  useDeleteWorkout,
  useRemoveWorkoutExercise,
  useReorderWorkoutExercises,
  useStartWorkout,
  useUpdateWorkoutSet,
} from '../api/workouts';
import { aggregateExerciseOverview } from '../lib/workout-stats';
import { orderSubgroups } from '../lib/muscleGroups';
import { useBackClose } from '../lib/backStack';
import { HoldToDelete } from '../components/HoldToDelete';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SortableList } from '../components/SortableList';

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

function num(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Метки упражнений: повторяющиеся имена нумеруются «Имя 1», «Имя 2»… (по position). */
function exerciseLabels(exercises: WorkoutExerciseResponse[]): Map<number, string> {
  const total = new Map<string, number>();
  for (const ex of exercises) total.set(ex.exerciseName, (total.get(ex.exerciseName) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out = new Map<number, string>();
  for (const ex of [...exercises].sort((a, b) => a.position - b.position)) {
    if ((total.get(ex.exerciseName) ?? 0) > 1) {
      const n = (seen.get(ex.exerciseName) ?? 0) + 1;
      seen.set(ex.exerciseName, n);
      out.set(ex.position, `${ex.exerciseName} ${String(n)}`);
    } else {
      out.set(ex.position, ex.exerciseName);
    }
  }
  return out;
}

/** Оптимистично применяет частичный патч к конкретному подходу. */
function withSetPatch(
  w: WorkoutResponse,
  pos: number,
  idx: number,
  patch: Partial<WorkoutSetResponse>,
): WorkoutResponse {
  return {
    ...w,
    exercises: w.exercises.map((ex) =>
      ex.position !== pos
        ? ex
        : { ...ex, sets: ex.sets.map((s) => (s.setIndex === idx ? { ...s, ...patch } : s)) },
    ),
  };
}

/** Оптимистично переставляет упражнения по новому порядку позиций (с перенумерацией). */
function withReordered(w: WorkoutResponse, order: number[]): WorkoutResponse {
  const byPos = new Map(w.exercises.map((e) => [e.position, e]));
  const exercises = order
    .map((p, i): WorkoutExerciseResponse | undefined => {
      const e = byPos.get(p);
      return e ? { ...e, position: i } : undefined;
    })
    .filter((e): e is WorkoutExerciseResponse => e !== undefined);
  return { ...w, exercises };
}

function formatDuration(totalSec: number): string {
  const sec = totalSec % 60;
  const m = Math.floor(totalSec / 60);
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

function plannedText(set: WorkoutSetResponse | undefined): string {
  if (!set) return '—';
  const parts: string[] = [];
  if (set.plannedReps !== null) parts.push(String(set.plannedReps));
  if (set.plannedWeightKg !== null) parts.push(`× ${String(set.plannedWeightKg)} кг`);
  if (set.plannedTimeSec !== null) parts.push(`${String(set.plannedTimeSec)} с`);
  return parts.join(' ') || '—';
}

function actualText(set: WorkoutSetResponse): string {
  const parts: string[] = [];
  if (set.actualReps !== null) parts.push(String(set.actualReps));
  if (set.actualWeightKg !== null) parts.push(`× ${String(set.actualWeightKg)} кг`);
  if (set.actualTimeSec !== null) parts.push(`${String(set.actualTimeSec)} с`);
  return parts.join(' ') || '—';
}

/** Один подход из дефолтов упражнения (для повторов/времени + отдых). */
function buildPlannedSet(ex: ExerciseResponse): {
  plannedReps?: number;
  plannedWeightKg?: number;
  plannedTimeSec?: number;
  plannedRestSec?: number;
} {
  const set: {
    plannedReps?: number;
    plannedWeightKg?: number;
    plannedTimeSec?: number;
    plannedRestSec?: number;
  } = {};
  if (ex.defaultTimeSec !== null) {
    set.plannedTimeSec = ex.defaultTimeSec;
  } else {
    if (ex.defaultReps !== null) set.plannedReps = ex.defaultReps;
    if (ex.defaultWeightKg !== null) set.plannedWeightKg = ex.defaultWeightKg;
  }
  if (ex.restSec !== null) set.plannedRestSec = ex.restSec;
  return set;
}

export function RunWorkoutPage() {
  const { wid = '' } = useParams<{ wid: string }>();
  const q = useClientWorkout(wid);
  const workout = q.data;

  // Завершённую тренировку не показываем в режиме проведения — сразу её итоги.
  if (workout && workout.status !== 'draft' && workout.status !== 'active') {
    return <Navigate to={`/workouts/${wid}`} replace />;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-2 pb-28 pt-4">
      <Link
        to="/workouts"
        className="flex items-center gap-1 text-[14px] font-medium text-ink-muted"
      >
        <ChevronLeft size={18} /> Тренировки
      </Link>

      {q.isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
      {q.isError && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Тренировка не найдена.</p>
          <Link to="/workouts" className="text-sm font-medium text-accent-text">
            К списку
          </Link>
        </div>
      )}

      {workout && workout.status === 'draft' && <DraftView wid={wid} workout={workout} />}
      {workout && workout.status === 'active' && <ActiveView wid={wid} workout={workout} />}
    </div>
  );
}

/* ---------- Черновик: план + «Начать» + drag/add/remove/edit ---------- */

function DraftView({ wid, workout }: { wid: string; workout: WorkoutResponse }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateSet = useUpdateWorkoutSet();
  const addExercise = useAddWorkoutExercise();
  const removeExercise = useRemoveWorkoutExercise();
  const reorder = useReorderWorkoutExercises();
  const start = useStartWorkout();
  const del = useDeleteWorkout();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  // Черновик — временное превью: если уходим, не нажав «Начать», удаляем его,
  // чтобы ничего не сохранялось (ни шаблоны, ни черновики).
  const startedRef = useRef(false);
  const delRef = useRef(del.mutate);
  delRef.current = del.mutate;
  useEffect(() => {
    return () => {
      if (!startedRef.current) delRef.current(wid);
    };
  }, [wid]);

  const labels = exerciseLabels(workout.exercises);
  const items = workout.exercises.map((ex) => ({ ...ex, id: `ex-${String(ex.position)}` }));
  const empty = workout.exercises.length === 0;

  function savePlan(pos: number, set: WorkoutSetResponse, input: UpdateSetRequest) {
    updateSet.mutate(
      { wid, setId: `${String(pos)}:${String(set.setIndex)}`, input },
      { onSuccess: () => setEditing(null) },
    );
  }

  return (
    <>
      <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">
        {workout.name}
      </h1>
      <p className="-mt-2 text-[13px] text-ink-muted">
        План тренировки. Нажмите «Начать», чтобы провести.
      </p>

      <SortableList
        items={items}
        onReorder={(next) => {
          const order = next.map((it) => it.position);
          qc.setQueryData(clientWorkoutQueryKey(wid), (prev?: WorkoutResponse) =>
            prev ? withReordered(prev, order) : prev,
          );
          reorder.mutate({ wid, order });
        }}
        renderItem={(ex) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[14px] font-semibold text-ink">
                {labels.get(ex.position) ?? ex.exerciseName}
              </span>
              <HoldToDelete
                icon="trash"
                label="Удерживайте, чтобы убрать упражнение"
                onDelete={() => removeExercise.mutate({ wid, pos: ex.position })}
              />
            </div>
            {ex.sets.map((set) => {
              const key = `${String(ex.position)}-${String(set.setIndex)}`;
              return editing === key ? (
                <PlannedSetEditor
                  key={set.setIndex}
                  set={set}
                  onCancel={() => setEditing(null)}
                  onSave={(input) => savePlan(ex.position, set, input)}
                />
              ) : (
                <div key={set.setIndex} className="flex items-center justify-between gap-2">
                  <span className="font-[family-name:var(--font-mono)] text-[19px] tabular-nums text-ink-muted">
                    {plannedText(set)}
                  </span>
                  <button
                    type="button"
                    aria-label="Изменить план"
                    onClick={() => setEditing(key)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-card-elevated text-ink-muted active:scale-95"
                  >
                    <Pencil size={16} strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      />

      <AddExerciseButton onClick={() => setAdding(true)} />

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[430px] border-t border-card bg-bg px-4 py-3">
        <button
          type="button"
          onClick={() =>
            start.mutate(workout.id, {
              onSuccess: (started) => {
                startedRef.current = true;
                void navigate(`/workouts/${started.id}/run`);
              },
            })
          }
          disabled={start.isPending || empty}
          className="flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-on active:opacity-90 disabled:opacity-50"
        >
          {start.isPending ? 'Запускаем…' : empty ? 'Добавьте упражнение' : 'Начать тренировку'}
        </button>
      </div>

      {adding && (
        <ExercisePickerSheet
          workout={workout}
          pending={addExercise.isPending || removeExercise.isPending}
          onClose={() => setAdding(false)}
          onAdd={(ex) =>
            addExercise.mutate({ wid, input: { exerciseId: ex.id, sets: [buildPlannedSet(ex)] } })
          }
          onRemove={(ex) => {
            const pos = workout.exercises.find((w) => w.exerciseId === ex.id)?.position;
            if (pos !== undefined) removeExercise.mutate({ wid, pos });
          }}
        />
      )}
    </>
  );
}

/* ---------- Активная: чек-лист + таймер + drag/add/remove + завершение ---------- */

function ActiveView({ wid, workout }: { wid: string; workout: WorkoutResponse }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateSet = useUpdateWorkoutSet();
  const complete = useCompleteWorkout();
  const reorder = useReorderWorkoutExercises();
  const addExercise = useAddWorkoutExercise();
  const removeExercise = useRemoveWorkoutExercise();
  const elapsed = useElapsed(workout.startedAt);

  const [editing, setEditing] = useState<string | null>(null);
  const [rest, setRest] = useState<{ key: string; sec: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [doneExpanded, setDoneExpanded] = useState(false);

  const finishWorkout = () =>
    complete.mutate(
      { wid, input: { durationSec: elapsed > 0 ? elapsed : null, rpe: null } },
      { onSuccess: () => void navigate(`/workouts/${wid}`) },
    );

  const counters = useMemo(() => {
    const all = workout.exercises.flatMap((e) => e.sets);
    return { done: all.filter((s) => s.done).length, total: all.length };
  }, [workout]);

  const isDoneEx = (ex: WorkoutExerciseResponse) =>
    ex.sets.length > 0 && ex.sets.every((s) => s.done);
  const completed = workout.exercises.filter(isDoneEx);
  const pending = workout.exercises.filter((ex) => !isDoneEx(ex));
  const pendingItems = pending.map((ex) => ({ ...ex, id: `ex-${String(ex.position)}` }));
  const visibleCompleted = doneExpanded ? completed : [];

  function toggleDone(ex: WorkoutExerciseResponse, set: WorkoutSetResponse) {
    const nextDone = !set.done;
    const noActual =
      set.actualReps === null && set.actualWeightKg === null && set.actualTimeSec === null;
    const fillActual = nextDone && noActual;

    const patch: Partial<WorkoutSetResponse> = { done: nextDone };
    const input: UpdateSetRequest = { done: nextDone };
    if (fillActual) {
      patch.actualReps = set.plannedReps;
      patch.actualWeightKg = set.plannedWeightKg;
      patch.actualTimeSec = set.plannedTimeSec;
      input.actualReps = set.plannedReps;
      input.actualWeightKg = set.plannedWeightKg;
      input.actualTimeSec = set.plannedTimeSec;
    }

    runWithTransition(() => {
      qc.setQueryData(clientWorkoutQueryKey(wid), (prev?: WorkoutResponse) =>
        prev ? withSetPatch(prev, ex.position, set.setIndex, patch) : prev,
      );
    });
    updateSet.mutate({ wid, setId: `${String(ex.position)}:${String(set.setIndex)}`, input });
    if (nextDone && set.plannedRestSec && set.plannedRestSec > 0) {
      setRest({ key: `${String(ex.position)}-${String(set.setIndex)}`, sec: set.plannedRestSec });
    }
  }

  function saveFact(ex: WorkoutExerciseResponse, set: WorkoutSetResponse, input: UpdateSetRequest) {
    updateSet.mutate(
      {
        wid,
        setId: `${String(ex.position)}:${String(set.setIndex)}`,
        input: { ...input, done: true },
      },
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

  const labels = exerciseLabels(workout.exercises);
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
            <span className="truncate text-[14px] font-semibold text-ink">
              {labels.get(ex.position) ?? ex.exerciseName}
            </span>
            {isEditing ? (
              <SetEditor
                set={set}
                onCancel={() => setEditing(null)}
                onSave={(input) => saveFact(ex, set, input)}
                onDelete={() => {
                  setEditing(null);
                  removeExercise.mutate({ wid, pos: ex.position });
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
    <>
      <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">
        {workout.name}
      </h1>

      {/* Сводка: слева — прошедшее время; справа — отдых либо завершение удержанием. */}
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
            key={rest.key}
            seconds={rest.sec}
            onDone={() => setRest(null)}
            onSkip={() => setRest(null)}
          />
        ) : (
          <HoldComplete pending={complete.isPending} onComplete={finishWorkout} />
        )}
      </div>

      {/* Коллектор завершённых: свёрнуто — только счётчик, развёрнуто — все. */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setDoneExpanded((v) => !v)}
          className="flex items-center justify-between gap-2 rounded-xl bg-card px-3.5 py-3"
        >
          <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Завершено · {completed.length}
          </span>
          <span className="flex items-center gap-2.5">
            <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold tabular-nums text-ink">
              {counters.done} / {counters.total}
              <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-mutedxl">
                подходов
              </span>
            </span>
            <ChevronDown
              size={18}
              className={`text-ink-muted transition-transform ${doneExpanded ? 'rotate-180' : ''}`}
            />
          </span>
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
          onReorder={(next) => {
            const order = [...completed.map((c) => c.position), ...next.map((it) => it.position)];
            qc.setQueryData(clientWorkoutQueryKey(wid), (prev?: WorkoutResponse) =>
              prev ? withReordered(prev, order) : prev,
            );
            reorder.mutate({ wid, order });
          }}
          renderItem={(ex) => cardBody(ex)}
        />
      )}

      <AddExerciseButton onClick={() => setAdding(true)} />

      {/* Все подходы выполнены — большая кнопка завершения. */}
      {workout.exercises.length > 0 && pending.length === 0 && (
        <HoldComplete variant="block" pending={complete.isPending} onComplete={finishWorkout} />
      )}

      {adding && (
        <ExercisePickerSheet
          workout={workout}
          pending={addExercise.isPending || removeExercise.isPending}
          onClose={() => setAdding(false)}
          onAdd={(ex) =>
            addExercise.mutate({ wid, input: { exerciseId: ex.id, sets: [buildPlannedSet(ex)] } })
          }
          onRemove={(ex) => {
            const pos = workout.exercises.find((w) => w.exerciseId === ex.id)?.position;
            if (pos !== undefined) removeExercise.mutate({ wid, pos });
          }}
        />
      )}
    </>
  );
}

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

/* ---------- Редактор факта подхода (active) ---------- */

function SetEditor({
  set,
  onCancel,
  onSave,
  onDelete,
}: {
  set: WorkoutSetResponse;
  onCancel: () => void;
  onSave: (input: UpdateSetRequest) => void;
  onDelete: () => void;
}) {
  // Всегда показываем все поля факта (повторы/вес/время), а не только заполненные.
  const [reps, setReps] = useState(String(set.actualReps ?? set.plannedReps ?? ''));
  const [weight, setWeight] = useState(String(set.actualWeightKg ?? set.plannedWeightKg ?? ''));
  const [time, setTime] = useState(String(set.actualTimeSec ?? set.plannedTimeSec ?? ''));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-2">
        <LabeledNum label="Повторы" value={reps} onChange={setReps} />
        <LabeledNum label="Вес, кг" value={weight} onChange={setWeight} />
        <LabeledNum label="Время, с" value={time} onChange={setTime} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label="Сохранить подход"
          onClick={() =>
            onSave({
              actualReps: num(reps),
              actualWeightKg: num(weight),
              actualTimeSec: num(time),
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
    </div>
  );
}

/* ---------- Редактор плановых значений подхода (draft) ---------- */

function PlannedSetEditor({
  set,
  onCancel,
  onSave,
}: {
  set: WorkoutSetResponse;
  onCancel: () => void;
  onSave: (input: UpdateSetRequest) => void;
}) {
  // Всегда показываем все поля плана (повторы/вес/время/отдых), а не только заполненные.
  const [reps, setReps] = useState(String(set.plannedReps ?? ''));
  const [weight, setWeight] = useState(String(set.plannedWeightKg ?? ''));
  const [time, setTime] = useState(String(set.plannedTimeSec ?? ''));
  const [rest, setRest] = useState(String(set.plannedRestSec ?? ''));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <LabeledNum label="Повторы" value={reps} onChange={setReps} />
        <LabeledNum label="Вес, кг" value={weight} onChange={setWeight} />
        <LabeledNum label="Время, с" value={time} onChange={setTime} />
        <LabeledNum label="Отдых, с" value={rest} onChange={setRest} />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          aria-label="Сохранить подход"
          onClick={() =>
            onSave({
              plannedReps: num(reps),
              plannedWeightKg: num(weight),
              plannedTimeSec: num(time),
              plannedRestSec: num(rest),
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
      </div>
    </div>
  );
}

function LabeledNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="px-0.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </span>
      <span className="flex h-10 items-center rounded-lg border border-line bg-chip px-2 focus-within:border-accent">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-full min-w-0 bg-transparent text-center font-[family-name:var(--font-mono)] text-[15px] tabular-nums text-ink outline-none"
        />
      </span>
    </label>
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

/* ---------- Завершение тренировки (тап → подтверждение) ---------- */

function HoldComplete({
  pending,
  onComplete,
  variant = 'pill',
}: {
  pending: boolean;
  onComplete: () => void;
  variant?: 'pill' | 'block';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Завершить тренировку"
        disabled={pending}
        onClick={() => setOpen(true)}
        className={`flex select-none items-center justify-center active:opacity-90 disabled:opacity-50 ${
          variant === 'block'
            ? 'h-12 w-full rounded-2xl bg-accent text-accent-on'
            : 'h-10 rounded-full bg-black/10 px-5 text-accent-on'
        }`}
      >
        <span className="text-[14px] font-medium">Завершить</span>
      </button>
      {open && (
        <ConfirmDialog
          message="Завершить тренировку?"
          confirmLabel="Завершить"
          onConfirm={() => {
            setOpen(false);
            onComplete();
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ---------- Лист выбора упражнения из каталога ---------- */

const PICKER_GROUP_ORDER = [
  'Грудь',
  'Спина',
  'Ноги',
  'Плечи',
  'Руки',
  'Корпус',
  'Пресс/Кор',
  'Кардио',
  'Растяжка',
  'Йога',
];

function orderPickerGroups(present: Set<string>): string[] {
  const ordered = PICKER_GROUP_ORDER.filter((g) => present.has(g));
  const extras = [...present]
    .filter((g) => !PICKER_GROUP_ORDER.includes(g))
    .sort((a, b) => a.localeCompare(b, 'ru'));
  return [...ordered, ...extras];
}

function PickerChip({
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
      className={`shrink-0 rounded-full px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs transition-colors ${
        active ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

function PickerThumb({ url, alt }: { url: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const box = 'h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-chip';
  if (url && !failed) {
    return (
      <span className={`${box} relative block`}>
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </span>
    );
  }
  return (
    <span className={`${box} flex items-center justify-center text-ink-muted`}>
      <Dumbbell size={18} strokeWidth={1.8} />
    </span>
  );
}

/** Краткая информация об упражнении (кнопка «i»): фото, мышцы, описание. */
function ExerciseInfoModal({
  exercise,
  onClose,
}: {
  exercise: ExerciseResponse;
  onClose: () => void;
}) {
  useBackClose(onClose);
  const muscles = [exercise.category, exercise.subgroup].filter(Boolean).join(' · ');
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-bg p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={exercise.name}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold leading-tight text-ink">{exercise.name}</h2>
            {muscles && <p className="mt-0.5 text-[13px] text-ink-muted">{muscles}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-ink-muted active:scale-95"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        {exercise.imageUrl && (
          <img
            src={exercise.imageUrl}
            alt={exercise.name}
            className="mb-3 w-full rounded-xl bg-card object-contain"
          />
        )}
        {(exercise.equipment || exercise.primaryMuscles || exercise.secondaryMuscles) && (
          <dl className="mb-3 flex flex-col gap-1.5 rounded-xl bg-card px-4 py-3 text-[14px]">
            {exercise.equipment && (
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-ink-muted">Оборудование</dt>
                <dd className="text-ink">{exercise.equipment}</dd>
              </div>
            )}
            {exercise.primaryMuscles && (
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-ink-muted">Целевые</dt>
                <dd className="text-ink">{exercise.primaryMuscles}</dd>
              </div>
            )}
            {exercise.secondaryMuscles && (
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-ink-muted">Дополнительно</dt>
                <dd className="text-ink">{exercise.secondaryMuscles}</dd>
              </div>
            )}
          </dl>
        )}
        {exercise.description && (
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">
            {exercise.description}
          </p>
        )}
      </div>
    </div>
  );
}

// Пикер упражнений как при создании тренировки: чипы групп мышц, миниатюры,
// кнопка «i» и ЧЕКБОКС — тап добавляет упражнение, повторный тап убирает.
function ExercisePickerSheet({
  workout,
  pending,
  onClose,
  onAdd,
  onRemove,
}: {
  workout: WorkoutResponse;
  pending: boolean;
  onClose: () => void;
  onAdd: (exercise: ExerciseResponse) => void;
  onRemove: (exercise: ExerciseResponse) => void;
}) {
  useBackClose(onClose);
  const exercises = useClientExercises();
  const workouts = useClientWorkouts();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [subgroup, setSubgroup] = useState('');
  const [infoEx, setInfoEx] = useState<ExerciseResponse | null>(null);

  // Уже добавленные в эту тренировку — для отметки чекбокса.
  const selected = useMemo(
    () => new Set(workout.exercises.map((e) => e.exerciseId)),
    [workout.exercises],
  );

  // Доступны только упражнения из базы знаний — те, что были на проведённых тренировках.
  const kbIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ov of aggregateExerciseOverview(workouts.data ?? [])) ids.add(ov.exerciseId);
    return ids;
  }, [workouts.data]);
  const list = useMemo(
    () => (exercises.data ?? []).filter((e) => kbIds.has(e.id)),
    [exercises.data, kbIds],
  );

  const groupChips = useMemo(() => {
    const present = new Set<string>();
    for (const e of list) if (e.category) present.add(e.category);
    return orderPickerGroups(present);
  }, [list]);
  const subgroupChips = useMemo(() => {
    if (group === '') return [];
    const present = new Set<string>();
    for (const e of list) if (e.category === group && e.subgroup) present.add(e.subgroup);
    return orderSubgroups(group, present);
  }, [list, group]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((e) => {
      if (group && e.category !== group) return false;
      if (subgroup && e.subgroup !== subgroup) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, group, subgroup, query]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="pointer-events-none relative z-10 h-12 pt-[max(0.75rem,env(safe-area-inset-top))]" />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2 className="px-5 pb-2 pt-4 text-[16px] font-bold text-ink">Добавить упражнение</h2>

        <div className="px-5 pb-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск упражнения"
              className="w-full rounded-2xl bg-card py-2.5 pl-4 pr-10 text-[14px] text-ink outline-none placeholder:text-ink-muted"
            />
            {query !== '' && (
              <button
                type="button"
                aria-label="Очистить"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted active:text-ink"
              >
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {groupChips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-5 pb-2">
            <PickerChip
              active={group === ''}
              onClick={() => {
                setGroup('');
                setSubgroup('');
              }}
            >
              Все
            </PickerChip>
            {groupChips.map((g) => (
              <PickerChip
                key={g}
                active={group === g}
                onClick={() => {
                  setGroup(g);
                  setSubgroup('');
                }}
              >
                {g}
              </PickerChip>
            ))}
          </div>
        )}
        {subgroupChips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-5 pb-2">
            <PickerChip active={subgroup === ''} onClick={() => setSubgroup('')}>
              Все
            </PickerChip>
            {subgroupChips.map((s) => (
              <PickerChip key={s} active={subgroup === s} onClick={() => setSubgroup(s)}>
                {s}
              </PickerChip>
            ))}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 pt-1">
          {exercises.isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
          {exercises.isError && (
            <p className="text-sm text-ink-muted" role="alert">
              Не удалось загрузить каталог.
            </p>
          )}
          {exercises.isSuccess && filtered.length === 0 && (
            <p className="text-sm text-ink-muted">Ничего не найдено.</p>
          )}
          {filtered.map((ex) => {
            const picked = selected.has(ex.id);
            return (
              <div key={ex.id} className="flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => (picked ? onRemove(ex) : onAdd(ex))}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      picked ? 'bg-accent text-accent-on' : 'border border-line bg-transparent'
                    }`}
                  >
                    {picked && <Check size={16} strokeWidth={3} />}
                  </span>
                  <PickerThumb url={ex.thumbUrl ?? ex.imageUrl} alt={ex.name} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold text-ink">{ex.name}</span>
                    {(ex.category || ex.subgroup) && (
                      <span className="truncate font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                        {[ex.category, ex.subgroup].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Кратко об упражнении"
                  onClick={() => setInfoEx(ex)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-ink-muted active:scale-95"
                >
                  <Info size={16} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {infoEx && <ExerciseInfoModal exercise={infoEx} onClose={() => setInfoEx(null)} />}
    </div>
  );
}
