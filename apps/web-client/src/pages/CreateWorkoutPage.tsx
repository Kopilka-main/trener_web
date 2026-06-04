import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, X } from 'lucide-react';
import type { CreateWorkoutRequest, ExerciseResponse } from '@trener/shared';
import { useClientExercises } from '../api/exercises';
import { useCreateWorkout, useStartWorkout } from '../api/workouts';
import { orderSubgroups } from '../lib/muscleGroups';

/** Упражнение, добавленное в план: число подходов + плановые повторы/вес/время. */
interface PlanItem {
  exercise: ExerciseResponse;
  setCount: number;
  plannedReps: number | null;
  plannedWeightKg: number | null;
  plannedTimeSec: number | null;
}

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function CreateWorkoutPage() {
  const navigate = useNavigate();
  const exercises = useClientExercises();
  const create = useCreateWorkout();
  const start = useStartWorkout();

  const [name, setName] = useState('Моя тренировка');
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [group, setGroup] = useState<string | null>(null);
  const [subgroup, setSubgroup] = useState<string | null>(null);

  const catalog = exercises.data ?? [];
  const addedIds = useMemo(() => new Set(plan.map((p) => p.exercise.id)), [plan]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const ex of catalog) set.add(ex.category);
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [catalog]);

  const subgroups = useMemo(() => {
    if (group === null) return [];
    const present = new Set<string>();
    for (const ex of catalog) {
      if (ex.category === group && ex.subgroup) present.add(ex.subgroup);
    }
    return orderSubgroups(group, present);
  }, [catalog, group]);

  const filtered = useMemo(
    () =>
      catalog.filter((ex) => {
        if (group !== null && ex.category !== group) return false;
        if (subgroup !== null && ex.subgroup !== subgroup) return false;
        return true;
      }),
    [catalog, group, subgroup],
  );

  function selectGroup(next: string | null) {
    setGroup(next);
    setSubgroup(null);
  }

  function addExercise(ex: ExerciseResponse) {
    setPlan((prev) => {
      if (prev.some((p) => p.exercise.id === ex.id)) return prev;
      return [
        ...prev,
        {
          exercise: ex,
          setCount: 3,
          plannedReps: ex.defaultReps,
          plannedWeightKg: ex.defaultWeightKg,
          plannedTimeSec: ex.defaultTimeSec,
        },
      ];
    });
  }

  function updateItem(id: string, patch: Partial<PlanItem>) {
    setPlan((prev) => prev.map((p) => (p.exercise.id === id ? { ...p, ...patch } : p)));
  }

  function removeItem(id: string) {
    setPlan((prev) => prev.filter((p) => p.exercise.id !== id));
  }

  const canCreate = name.trim().length > 0 && plan.length > 0 && plan.every((p) => p.setCount >= 1);
  const isBusy = create.isPending || start.isPending;

  function submit() {
    if (!canCreate) return;
    const payload: CreateWorkoutRequest = {
      name: name.trim(),
      exercises: plan.map((p) => ({
        exerciseId: p.exercise.id,
        sets: Array.from({ length: p.setCount }, () => {
          const set: {
            plannedReps?: number;
            plannedWeightKg?: number;
            plannedTimeSec?: number;
          } = {};
          if (p.plannedReps !== null) set.plannedReps = p.plannedReps;
          if (p.plannedWeightKg !== null) set.plannedWeightKg = p.plannedWeightKg;
          if (p.plannedTimeSec !== null) set.plannedTimeSec = p.plannedTimeSec;
          return set;
        }),
      })),
    };
    create.mutate(payload, {
      onSuccess: (workout) => {
        start.mutate(workout.id, {
          onSuccess: (started) => {
            void navigate(`/workouts/${started.id}/run`);
          },
        });
      },
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-28 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">
        Новая тренировка
      </h1>

      <label className="flex flex-col gap-1">
        <span className="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
          Название
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-2xl bg-card px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-mutedxl"
          placeholder="Моя тренировка"
        />
      </label>

      {plan.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
            План ({plan.length})
          </h2>
          {plan.map((p) => {
            const timeBased = p.plannedTimeSec !== null && p.plannedReps === null;
            return (
              <div key={p.exercise.id} className="flex flex-col gap-3 rounded-2xl bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[15px] font-semibold text-ink">{p.exercise.name}</span>
                  <button
                    type="button"
                    aria-label="Убрать упражнение"
                    onClick={() => removeItem(p.exercise.id)}
                    className="shrink-0 text-ink-muted active:text-ink"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-ink-muted">Подходы</span>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Меньше подходов"
                      onClick={() =>
                        updateItem(p.exercise.id, { setCount: Math.max(1, p.setCount - 1) })
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-card-elevated text-ink"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-6 text-center text-[15px] font-semibold tabular-nums text-ink">
                      {p.setCount}
                    </span>
                    <button
                      type="button"
                      aria-label="Больше подходов"
                      onClick={() => updateItem(p.exercise.id, { setCount: p.setCount + 1 })}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-card-elevated text-ink"
                    >
                      <Plus size={16} />
                    </button>
                  </span>
                </div>

                <div className="flex gap-2">
                  {timeBased ? (
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-[12px] text-ink-muted">Время, сек</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={p.plannedTimeSec ?? ''}
                        onChange={(e) =>
                          updateItem(p.exercise.id, { plannedTimeSec: numOrNull(e.target.value) })
                        }
                        className="rounded-xl bg-card-elevated px-3 py-2 text-[15px] text-ink outline-none"
                      />
                    </label>
                  ) : (
                    <>
                      <label className="flex flex-1 flex-col gap-1">
                        <span className="text-[12px] text-ink-muted">Повторы</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={p.plannedReps ?? ''}
                          onChange={(e) =>
                            updateItem(p.exercise.id, { plannedReps: numOrNull(e.target.value) })
                          }
                          className="rounded-xl bg-card-elevated px-3 py-2 text-[15px] text-ink outline-none"
                        />
                      </label>
                      <label className="flex flex-1 flex-col gap-1">
                        <span className="text-[12px] text-ink-muted">Вес, кг</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={p.plannedWeightKg ?? ''}
                          onChange={(e) =>
                            updateItem(p.exercise.id, {
                              plannedWeightKg: numOrNull(e.target.value),
                            })
                          }
                          className="rounded-xl bg-card-elevated px-3 py-2 text-[15px] text-ink outline-none"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
          Каталог упражнений
        </h2>

        {exercises.isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
        {exercises.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось загрузить каталог.
          </p>
        )}
        {exercises.isSuccess && catalog.length === 0 && (
          <p className="text-sm text-ink-muted">
            Каталог пуст. Подключите тренера, чтобы получить упражнения.
          </p>
        )}

        {groups.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <FilterChip active={group === null} onClick={() => selectGroup(null)}>
                Все
              </FilterChip>
              {groups.map((g) => (
                <FilterChip key={g} active={group === g} onClick={() => selectGroup(g)}>
                  {g}
                </FilterChip>
              ))}
            </div>
            {subgroups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <FilterChip active={subgroup === null} onClick={() => setSubgroup(null)}>
                  Все
                </FilterChip>
                {subgroups.map((s) => (
                  <FilterChip key={s} active={subgroup === s} onClick={() => setSubgroup(s)}>
                    {s}
                  </FilterChip>
                ))}
              </div>
            )}
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {filtered.map((ex) => {
            const added = addedIds.has(ex.id);
            return (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => addExercise(ex)}
                  disabled={added}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left disabled:opacity-50"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold text-ink">{ex.name}</span>
                    {(ex.category || ex.subgroup) && (
                      <span className="text-[12px] text-ink-muted">
                        {[ex.category, ex.subgroup].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-ink-muted">
                    {added ? 'Добавлено' : <Plus size={18} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[430px] border-t border-card bg-bg px-4 py-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canCreate || isBusy}
          className="flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-on active:opacity-90 disabled:opacity-50"
        >
          {isBusy ? 'Создаём…' : 'Создать и начать'}
        </button>
      </div>
    </div>
  );
}

function FilterChip({
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
      className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
        active ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
      }`}
    >
      {children}
    </button>
  );
}
