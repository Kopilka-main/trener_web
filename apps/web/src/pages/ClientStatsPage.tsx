import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BarChart3, ChevronRight } from 'lucide-react';
import type { WorkoutResponse } from '@trener/shared';
import { useClientWorkouts } from '../api/client-workouts';
import { ScreenHeader } from '../components/ScreenHeader';
import { aggregateClientStats, workoutRowStats } from '../lib/workout-stats';

function completedAtMs(w: WorkoutResponse): number {
  const raw = w.completedAt ?? w.startedAt;
  return raw ? Date.parse(raw) : 0;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Компактный тоннаж: до 1000 кг — кг, выше — тонны. */
function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace('.', ',')} т`;
  return `${String(kg)} кг`;
}

/** Компактная длительность для метрики и строки: ч/мин. */
function formatDurationShort(totalSec: number): string {
  const min = Math.round(totalSec / 60);
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${String(h)} ч ${String(m)} мин` : `${String(h)} ч`;
  }
  return `${String(min)} мин`;
}

export function ClientStatsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const workouts = useClientWorkouts(id);
  const list = workouts.data ?? [];

  const stats = useMemo(() => aggregateClientStats(list), [list]);
  const history = useMemo(
    () =>
      list
        .filter((w) => w.status === 'completed')
        .sort((a, b) => completedAtMs(b) - completedAtMs(a)),
    [list],
  );

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Статистика" back={`/clients/${id}`} />

      <div className="flex flex-1 flex-col gap-6 px-5 pb-8 pt-2">
        {workouts.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {workouts.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось загрузить статистику. Попробуйте обновить страницу.
          </p>
        )}

        {workouts.isSuccess && stats.completedWorkouts === 0 && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center">
            <BarChart3 size={28} strokeWidth={1.6} className="text-ink-muted" />
            <p className="text-sm text-ink-muted">
              Пока нет данных. Статистика появится после первой завершённой тренировки.
            </p>
          </div>
        )}

        {workouts.isSuccess && stats.completedWorkouts > 0 && (
          <>
            <section className="grid grid-cols-2 gap-3">
              <MetricCard label="Тренировок" value={String(stats.completedWorkouts)} />
              <MetricCard label="Тоннаж" value={formatTonnage(stats.tonnageKg)} />
              <MetricCard label="Подходов" value={String(stats.doneSets)} />
              <MetricCard label="Повторов" value={String(stats.totalReps)} />
              {stats.avgRpe !== null && (
                <MetricCard
                  label="Ср. RPE"
                  value={`${stats.avgRpe.toLocaleString('ru-RU')} / 10`}
                />
              )}
              {stats.totalDurationSec > 0 && (
                <MetricCard label="Время" value={formatDurationShort(stats.totalDurationSec)} />
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
                История
              </h2>
              <ul className="flex flex-col gap-2">
                {history.map((w) => (
                  <HistoryRow key={w.id} clientId={id} workout={w} />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile-shadow flex flex-col gap-1 rounded-2xl p-4">
      <span className="font-[family-name:var(--font-mono)] text-[26px] font-bold tabular-nums leading-none text-ink">
        {value}
      </span>
      <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </span>
    </div>
  );
}

function HistoryRow({ clientId, workout }: { clientId: string; workout: WorkoutResponse }) {
  const { tonnageKg, doneSets } = workoutRowStats(workout);
  const date = formatDate(workout.completedAt ?? workout.startedAt);
  return (
    <li>
      <Link
        to={`/clients/${clientId}/workouts/${workout.id}`}
        className="row-glow flex items-center gap-3 rounded-2xl bg-card px-4 py-3 transition-colors active:bg-card-elevated"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold text-ink">{workout.name}</span>
          <span className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
            {date && <span>{date}</span>}
            <span>· {String(doneSets)} подх.</span>
            {tonnageKg > 0 && <span>· {formatTonnage(tonnageKg)}</span>}
            {workout.durationSec !== null && workout.durationSec > 0 && (
              <span>· {formatDurationShort(workout.durationSec)}</span>
            )}
          </span>
        </span>
        <ChevronRight size={16} className="tile-chevron shrink-0" />
      </Link>
    </li>
  );
}
