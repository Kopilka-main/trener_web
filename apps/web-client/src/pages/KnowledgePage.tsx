import { useMemo } from 'react';
import { useClientMe } from '../api/auth';
import { useClientWorkouts } from '../api/workouts';
import { aggregateExerciseOverview } from '../lib/workout-stats';

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

/** База знаний клиента: упражнения, которые тренер давал на проведённых тренировках
 * (выводится из завершённых тренировок, без отдельного бэкенда). Read-only. */
export function KnowledgePage() {
  const me = useClientMe();
  const linked = me.data?.link != null;
  const workouts = useClientWorkouts();

  const items = useMemo(
    () =>
      [...aggregateExerciseOverview(workouts.data ?? [])].sort((a, b) =>
        (b.lastDate ?? '').localeCompare(a.lastDate ?? ''),
      ),
    [workouts.data],
  );

  return (
    <div className="flex h-full flex-col px-4 pb-8 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">База знаний</h1>
      <p className="mt-1 text-[13px] text-ink-muted">
        Упражнения, которые тренер давал на тренировках.
      </p>

      {workouts.isLoading && <p className="pt-6 text-sm text-ink-muted">Загрузка…</p>}
      {workouts.isError && (
        <p className="pt-6 text-sm text-ink-muted" role="alert">
          Не удалось загрузить. Попробуйте обновить страницу.
        </p>
      )}
      {workouts.isSuccess && items.length === 0 && (
        <p className="pt-6 text-sm text-ink-muted">
          {linked
            ? 'Пока нет упражнений из проведённых тренировок.'
            : 'Подключите тренера — здесь появятся упражнения с ваших тренировок.'}
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((ex) => (
          <li key={ex.exerciseId} className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-3">
            <span className="text-[15px] font-semibold text-ink">{ex.name}</span>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
              {ex.isTimeBased
                ? ex.maxTimeSec !== null && (
                    <span>
                      PR <b className="tabular-nums text-ink">{ex.maxTimeSec}</b> с
                    </span>
                  )
                : ex.maxWeightKg !== null && (
                    <span>
                      PR <b className="tabular-nums text-ink">{ex.maxWeightKg}</b> кг
                    </span>
                  )}
              {ex.lastDate && <span>· {shortDate(ex.lastDate)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
