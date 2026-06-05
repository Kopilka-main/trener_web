import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { WorkoutResponse, WorkoutSetResponse } from '@trener/shared';
import { useClientWorkout, useClientWorkouts } from '../api/workouts';
import { computeRecordKeys, setKey } from '../lib/records';
import { formatDateGroup } from '../lib/workoutDates';

function factText(s: WorkoutSetResponse): string {
  if (s.actualTimeSec !== null) return `${s.actualTimeSec} сек`;
  if (s.actualReps !== null || s.actualWeightKg !== null) {
    const reps = s.actualReps ?? '—';
    const kg = s.actualWeightKg !== null ? ` × ${s.actualWeightKg} кг` : '';
    return `${reps}${kg}`;
  }
  return '—';
}

function planText(s: WorkoutSetResponse): string {
  if (s.plannedTimeSec !== null) return `план ${s.plannedTimeSec} сек`;
  const reps = s.plannedReps ?? '—';
  const kg = s.plannedWeightKg !== null ? ` × ${s.plannedWeightKg} кг` : '';
  return `план ${reps}${kg}`;
}

export function WorkoutDetailPage() {
  const { wid = '' } = useParams<{ wid: string }>();
  const q = useClientWorkout(wid);
  const list = useClientWorkouts();
  const recordKeys = computeRecordKeys(list.data ?? []);

  return (
    <div className="flex flex-1 flex-col gap-4 px-2 pb-6 pt-4">
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

      {q.data && <WorkoutBody w={q.data} recordKeys={recordKeys} />}
    </div>
  );
}

function WorkoutBody({ w, recordKeys }: { w: WorkoutResponse; recordKeys: Set<string> }) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">{w.name}</h1>
        <p className="text-[12px] text-ink-muted">
          {w.completedAt ? formatDateGroup(w.completedAt) : ''}
          {w.durationSec ? ` · ${Math.round(w.durationSec / 60)} мин` : ''}
          {w.rpe ? ` · RPE ${w.rpe}` : ''}
        </p>
        {w.trainerNote && (
          <p className="mt-1 rounded-xl bg-card px-3 py-2 text-[13px] text-ink-muted">
            {w.trainerNote}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3">
        {w.exercises.map((ex) => (
          <section key={ex.position} className="rounded-2xl bg-card p-4">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">{ex.exerciseName}</h2>
            <ul className="flex flex-col gap-1.5">
              {ex.sets.map((s) => {
                const isRecord = recordKeys.has(setKey(w.id, ex.position, s.setIndex));
                return (
                  <li
                    key={s.setIndex}
                    className="flex items-center justify-between gap-3 text-[14px]"
                  >
                    <span className="flex items-center gap-2 text-ink">
                      {factText(s)}
                      {isRecord && (
                        <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-on">
                          рекорд
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] text-ink-mutedxl">{planText(s)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
