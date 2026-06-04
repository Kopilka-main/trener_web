import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import type { WorkoutResponse } from '@trener/shared';
import { useClientMe } from '../api/auth';
import { useClientWorkouts, useStartWorkout, useDeleteWorkout } from '../api/workouts';
import { HoldToDelete } from '../components/HoldToDelete';
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
  const navigate = useNavigate();
  const me = useClientMe();
  const q = useClientWorkouts();
  const start = useStartWorkout();
  const del = useDeleteWorkout();
  const linked = me.data?.link != null;

  const all = q.data ?? [];
  const own = all.filter((w) => w.createdByClient && w.status !== 'completed');
  const completed = all.filter((w) => w.status === 'completed');

  function continueOrStart(w: WorkoutResponse) {
    if (w.status === 'active') {
      void navigate(`/workouts/${w.id}/run`);
      return;
    }
    start.mutate(w.id, {
      onSuccess: (workout) => {
        void navigate(`/workouts/${workout.id}/run`);
      },
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] text-ink">Тренировки</h1>

      {linked ? (
        <button
          type="button"
          onClick={() => void navigate('/workouts/new')}
          className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-on active:opacity-90"
        >
          <Plus size={18} /> Новая тренировка
        </button>
      ) : (
        <p className="text-sm text-ink-muted">
          Вы пока не подключены к тренеру. Подключите его, чтобы здесь появились назначенные
          тренировки.
        </p>
      )}

      {q.isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
      {q.isError && (
        <p className="text-sm text-ink-muted">Не удалось загрузить. Потяните обновить.</p>
      )}

      {q.data && own.length === 0 && completed.length === 0 && linked && (
        <p className="text-sm text-ink-muted">
          Пока нет тренировок. Создайте свою или дождитесь назначенной тренером.
        </p>
      )}

      {own.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
            Активные и черновики
          </h2>
          {own.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-semibold text-ink">{w.name}</span>
                <span className="text-[12px] text-ink-muted">
                  {w.status === 'active' ? 'В процессе' : 'Черновик'} · {w.exercises.length} упр.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => continueOrStart(w)}
                  disabled={start.isPending}
                  className="rounded-xl bg-accent px-3 py-2 text-[13px] font-semibold text-accent-on active:opacity-90 disabled:opacity-60"
                >
                  {w.status === 'active' ? 'Продолжить' : 'Начать'}
                </button>
                <HoldToDelete
                  icon="trash"
                  label="Удерживайте, чтобы удалить тренировку"
                  onDelete={() => del.mutate(w.id)}
                />
              </span>
            </div>
          ))}
        </section>
      )}

      {completed.length > 0 && (
        <>
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
            Завершённые
          </h2>
          {groupByDate(completed).map((g) => (
            <section key={g.label} className="flex flex-col gap-2">
              <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-mutedxl">
                {g.label}
              </h3>
              {g.items.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => void navigate(`/workouts/${w.id}`)}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left active:bg-card-elevated"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-ink">{w.name}</span>
                      <span className="shrink-0 rounded-md bg-chip px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
                        {w.createdByClient ? 'своя' : 'от тренера'}
                      </span>
                    </span>
                    <span className="text-[12px] text-ink-muted">
                      {w.completedAt ? formatTime(w.completedAt) : ''}
                      {' · '}
                      {w.exercises.length} упр.
                      {w.durationSec ? ` · ${Math.round(w.durationSec / 60)} мин` : ''}
                      {w.rpe ? ` · RPE ${w.rpe}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-ink-mutedxl" />
                </button>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
