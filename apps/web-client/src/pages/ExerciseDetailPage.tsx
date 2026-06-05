import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { ExerciseResponse } from '@trener/shared';
import { useClientWorkouts } from '../api/workouts';
import { useClientExercises } from '../api/exercises';
import { aggregateExerciseOverview, type ExerciseOverview } from '../lib/workout-stats';

const RU_MONTHS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate())} ${RU_MONTHS[d.getMonth()] ?? ''}`;
}

/** Параметры упражнения из каталога — только заданные ненулевые. */
function paramRows(entry: ExerciseResponse): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (entry.defaultReps && entry.defaultReps > 0)
    rows.push({ label: 'Повторы', value: String(entry.defaultReps) });
  if (entry.defaultWeightKg && entry.defaultWeightKg > 0)
    rows.push({ label: 'Вес', value: `${String(entry.defaultWeightKg)} кг` });
  if (entry.defaultTimeSec && entry.defaultTimeSec > 0)
    rows.push({ label: 'Время', value: `${String(entry.defaultTimeSec)} сек` });
  if (entry.restSec && entry.restSec > 0)
    rows.push({ label: 'Отдых', value: `${String(entry.restSec)} сек` });
  return rows;
}

/** Read-only деталь упражнения: описание/параметры из каталога тренера + личный
 * результат клиента (PR) из проведённых тренировок. Навигация назад — глобальный BackFab. */
export function ExerciseDetailPage() {
  const { exerciseId = '' } = useParams<{ exerciseId: string }>();
  const exercises = useClientExercises();
  const workouts = useClientWorkouts();

  const entry = useMemo<ExerciseResponse | null>(
    () => (exercises.data ?? []).find((e) => e.id === exerciseId) ?? null,
    [exercises.data, exerciseId],
  );

  const overview = useMemo<ExerciseOverview | null>(
    () =>
      aggregateExerciseOverview(workouts.data ?? []).find((o) => o.exerciseId === exerciseId) ??
      null,
    [workouts.data, exerciseId],
  );

  const isLoading = exercises.isLoading || workouts.isLoading;
  const name = entry?.name ?? overview?.name ?? '';
  const category = entry?.category ?? null;
  const subgroup = entry?.subgroup ?? null;
  const description = entry?.description ?? null;
  const params = entry ? paramRows(entry) : [];

  return (
    <div className="flex flex-1 flex-col gap-4 px-2 pb-6 pt-5">
      {isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}

      {!isLoading && (
        <>
          <header className="flex flex-col gap-1">
            <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">
              {name || 'Упражнение'}
            </h1>
            {(category ?? subgroup) && (
              <p className="text-[13px] text-ink-muted">
                {[category, subgroup].filter(Boolean).join(' · ')}
              </p>
            )}
          </header>

          <section className="flex flex-col gap-1.5">
            <h2 className="font-[family-name:var(--font-mono)] text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Описание
            </h2>
            <p className="text-[14px] text-ink">{description ?? 'Описание не задано'}</p>
          </section>

          {params.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h2 className="font-[family-name:var(--font-mono)] text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Параметры
              </h2>
              <ul className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-3">
                {params.map((p) => (
                  <li
                    key={p.label}
                    className="flex items-baseline justify-between gap-3 text-[14px]"
                  >
                    <span className="text-ink-muted">{p.label}</span>
                    <span className="font-[family-name:var(--font-mono)] tabular-nums text-ink">
                      {p.value}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {overview && (
            <section className="flex flex-col gap-1.5">
              <h2 className="font-[family-name:var(--font-mono)] text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Ваш результат
              </h2>
              <div className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-3">
                {overview.isTimeBased
                  ? overview.maxTimeSec !== null && (
                      <div className="flex items-baseline justify-between gap-3 text-[14px]">
                        <span className="text-ink-muted">PR время</span>
                        <span className="font-[family-name:var(--font-mono)] tabular-nums text-ink">
                          {overview.maxTimeSec} сек
                        </span>
                      </div>
                    )
                  : overview.maxWeightKg !== null && (
                      <div className="flex items-baseline justify-between gap-3 text-[14px]">
                        <span className="text-ink-muted">PR вес</span>
                        <span className="font-[family-name:var(--font-mono)] tabular-nums text-ink">
                          {overview.maxWeightKg} кг
                        </span>
                      </div>
                    )}
                {overview.lastDate && (
                  <div className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="text-ink-muted">Последняя тренировка</span>
                    <span className="font-[family-name:var(--font-mono)] text-ink">
                      {shortDate(overview.lastDate)}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
