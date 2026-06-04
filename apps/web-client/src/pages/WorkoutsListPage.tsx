import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { WorkoutResponse } from '@trener/shared';
import { useClientMe } from '../api/auth';
import { useClientWorkouts } from '../api/workouts';
import { BackBar } from '../components/BackBar';
import { formatDateGroup, formatTime } from '../lib/workoutDates';

function groupByDate(workouts: WorkoutResponse[]): { label: string; items: WorkoutResponse[] }[] {
  const groups: { label: string; items: WorkoutResponse[] }[] = [];
  for (const w of workouts) {
    const label = w.completedAt ? formatDateGroup(w.completedAt) : 'Без даты';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(w);
    else groups.push({ label, items: [w] });
  }
  return groups;
}

export function WorkoutsListPage() {
  const me = useClientMe();
  const q = useClientWorkouts();
  const linked = me.data?.link != null;

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-2">
      <BackBar />
      <h1 className="-mt-1 font-[family-name:var(--font-display)] text-[28px] text-ink">
        Тренировки
      </h1>

      {q.isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
      {q.isError && (
        <p className="text-sm text-ink-muted">Не удалось загрузить. Потяните обновить.</p>
      )}
      {q.data && q.data.length === 0 && (
        <p className="text-sm text-ink-muted">
          {linked
            ? 'Пока нет завершённых тренировок.'
            : 'Вы пока не подключены к тренеру. Подключите его, чтобы здесь появились назначенные тренировки.'}
        </p>
      )}

      {q.data &&
        groupByDate(q.data).map((g) => (
          <section key={g.label} className="flex flex-col gap-2">
            <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
              {g.label}
            </h2>
            {g.items.map((w) => (
              <Link
                key={w.id}
                to={`/workouts/${w.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 active:bg-card-elevated"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold text-ink">{w.name}</span>
                  <span className="text-[12px] text-ink-muted">
                    {w.completedAt ? formatTime(w.completedAt) : ''}
                    {' · '}
                    {w.exercises.length} упр.
                    {w.durationSec ? ` · ${Math.round(w.durationSec / 60)} мин` : ''}
                    {w.rpe ? ` · RPE ${w.rpe}` : ''}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-mutedxl" />
              </Link>
            ))}
          </section>
        ))}
    </div>
  );
}
