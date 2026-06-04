import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Check } from 'lucide-react';
import type { UpdateSetRequest, WorkoutExerciseResponse, WorkoutSetResponse } from '@trener/shared';
import { useClientWorkout, useUpdateWorkoutSet, useCompleteWorkout } from '../api/workouts';

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function RunWorkoutPage() {
  const { wid = '' } = useParams<{ wid: string }>();
  const navigate = useNavigate();
  const q = useClientWorkout(wid);
  const updateSet = useUpdateWorkoutSet();
  const complete = useCompleteWorkout();
  const [rpe, setRpe] = useState<number | null>(null);

  const workout = q.data;
  const isActive = workout?.status === 'active';

  function finish() {
    complete.mutate(
      { wid, input: { rpe } },
      {
        onSuccess: () => {
          void navigate(`/workouts/${wid}`);
        },
      },
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-28 pt-4">
      <Link
        to="/workouts"
        className="flex items-center gap-1 text-[14px] font-medium text-ink-muted"
      >
        <ChevronLeft size={18} /> Тренировки
      </Link>

      {q.isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}

      {q.isSuccess && !isActive && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            Эта тренировка не запущена. Запустите её из списка тренировок.
          </p>
          <Link to="/workouts" className="text-sm font-medium text-accent">
            К списку
          </Link>
        </div>
      )}
      {q.isError && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Тренировка не найдена.</p>
          <Link to="/workouts" className="text-sm font-medium text-accent">
            К списку
          </Link>
        </div>
      )}

      {workout && isActive && (
        <>
          <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">
            {workout.name}
          </h1>

          <div className="flex flex-col gap-3">
            {workout.exercises.map((ex) => (
              <ExerciseCard
                key={ex.position}
                ex={ex}
                onLog={(setIndex, input) =>
                  updateSet.mutate({ wid, setId: `${ex.position}:${setIndex}`, input })
                }
                pending={updateSet.isPending}
              />
            ))}
          </div>

          <section className="flex flex-col gap-2 rounded-2xl bg-card p-4">
            <span className="text-[13px] font-semibold text-ink">Оценка нагрузки (RPE)</span>
            <div className="flex flex-wrap gap-2">
              {RPE_VALUES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRpe(rpe === v ? null : v)}
                  className={`h-9 w-9 rounded-full text-[14px] font-semibold transition-colors ${
                    rpe === v ? 'bg-accent text-accent-on' : 'bg-card-elevated text-ink'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {workout && isActive && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[430px] border-t border-card bg-bg px-4 py-3">
          <button
            type="button"
            onClick={finish}
            disabled={complete.isPending}
            className="flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-on active:opacity-90 disabled:opacity-50"
          >
            {complete.isPending ? 'Завершаем…' : 'Завершить тренировку'}
          </button>
        </div>
      )}
    </div>
  );
}

function ExerciseCard({
  ex,
  onLog,
  pending,
}: {
  ex: WorkoutExerciseResponse;
  onLog: (setIndex: number, input: UpdateSetRequest) => void;
  pending: boolean;
}) {
  return (
    <section className="rounded-2xl bg-card p-4">
      <h2 className="mb-2 text-[15px] font-semibold text-ink">{ex.exerciseName}</h2>
      <ul className="flex flex-col gap-2">
        {ex.sets.map((s) => (
          <SetRow
            key={s.setIndex}
            set={s}
            onLog={(input) => onLog(s.setIndex, input)}
            pending={pending}
          />
        ))}
      </ul>
    </section>
  );
}

function SetRow({
  set,
  onLog,
  pending,
}: {
  set: WorkoutSetResponse;
  onLog: (input: UpdateSetRequest) => void;
  pending: boolean;
}) {
  const timeBased = set.plannedTimeSec !== null;
  const [reps, setReps] = useState<string>(
    set.actualReps !== null
      ? String(set.actualReps)
      : set.plannedReps !== null
        ? String(set.plannedReps)
        : '',
  );
  const [weight, setWeight] = useState<string>(
    set.actualWeightKg !== null
      ? String(set.actualWeightKg)
      : set.plannedWeightKg !== null
        ? String(set.plannedWeightKg)
        : '',
  );
  const [time, setTime] = useState<string>(
    set.actualTimeSec !== null
      ? String(set.actualTimeSec)
      : set.plannedTimeSec !== null
        ? String(set.plannedTimeSec)
        : '',
  );

  function log() {
    const input: UpdateSetRequest = { done: true };
    if (timeBased) {
      input.actualTimeSec = numOrNull(time);
    } else {
      input.actualReps = numOrNull(reps);
      input.actualWeightKg = numOrNull(weight);
    }
    onLog(input);
  }

  return (
    <li
      className={`flex items-center gap-2 rounded-xl px-2 py-2 ${
        set.done ? 'bg-card-elevated' : ''
      }`}
    >
      <span className="w-5 shrink-0 text-center text-[13px] font-semibold tabular-nums text-ink-muted">
        {set.setIndex + 1}
      </span>
      {timeBased ? (
        <input
          type="number"
          inputMode="numeric"
          aria-label="Время, сек"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="min-w-0 flex-1 rounded-lg bg-card-elevated px-3 py-2 text-[15px] text-ink outline-none"
          placeholder="сек"
        />
      ) : (
        <>
          <input
            type="number"
            inputMode="numeric"
            aria-label="Повторы"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="min-w-0 flex-1 rounded-lg bg-card-elevated px-3 py-2 text-[15px] text-ink outline-none"
            placeholder="повт"
          />
          <input
            type="number"
            inputMode="decimal"
            aria-label="Вес, кг"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="min-w-0 flex-1 rounded-lg bg-card-elevated px-3 py-2 text-[15px] text-ink outline-none"
            placeholder="кг"
          />
        </>
      )}
      <button
        type="button"
        onClick={log}
        disabled={pending}
        aria-label="Готово"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
          set.done ? 'bg-accent text-accent-on' : 'bg-card-elevated text-ink-muted'
        }`}
      >
        <Check size={18} />
      </button>
    </li>
  );
}
