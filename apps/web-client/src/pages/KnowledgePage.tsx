import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExerciseResponse } from '@trener/shared';
import { useClientMe } from '../api/auth';
import { useClientWorkouts } from '../api/workouts';
import { useClientExercises } from '../api/exercises';
import { aggregateExerciseOverview, type ExerciseOverview } from '../lib/workout-stats';
import { orderSubgroups } from '../lib/muscleGroups';

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

/** Элемент базы знаний: упражнение с тренировки, обогащённое каталогом тренера. */
interface KnowledgeItem {
  id: string;
  name: string;
  category: string | null;
  subgroup: string | null;
  overview: ExerciseOverview;
}

/** База знаний клиента: упражнения с проведённых тренировок, обогащённые каталогом
 * тренера (группа/подгруппа), с фильтром по группе мышц и подгруппе. Read-only. */
export function KnowledgePage() {
  const navigate = useNavigate();
  const me = useClientMe();
  const linked = me.data?.link != null;
  const workouts = useClientWorkouts();
  const exercises = useClientExercises();

  const catalog = useMemo(() => {
    const map = new Map<string, ExerciseResponse>();
    for (const ex of exercises.data ?? []) map.set(ex.id, ex);
    return map;
  }, [exercises.data]);

  // Охват — упражнения с проведённых тренировок (источник списка), отсортирован
  // по дате последней сессии (свежие выше); каждое обогащаем каталогом.
  const items = useMemo<KnowledgeItem[]>(() => {
    const overview = aggregateExerciseOverview(workouts.data ?? []);
    return overview.map((ov) => {
      const entry = catalog.get(ov.exerciseId);
      return {
        id: ov.exerciseId,
        name: entry?.name ?? ov.name,
        category: entry?.category ?? null,
        subgroup: entry?.subgroup ?? null,
        overview: ov,
      };
    });
  }, [workouts.data, catalog]);

  const [group, setGroup] = useState<string | null>(null);
  const [subgroup, setSubgroup] = useState<string | null>(null);

  // Чипы групп — уникальные присутствующие категории (по алфавиту).
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.category) set.add(it.category);
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [items]);

  // Чипы подгрупп — присутствующие в выбранной группе, упорядоченные таксономией.
  const subgroups = useMemo(() => {
    if (group === null) return [];
    const present = new Set<string>();
    for (const it of items) {
      if (it.category === group && it.subgroup) present.add(it.subgroup);
    }
    return orderSubgroups(group, present);
  }, [items, group]);

  const filtered = useMemo(
    () =>
      items.filter((it) => {
        if (group !== null && it.category !== group) return false;
        if (subgroup !== null && it.subgroup !== subgroup) return false;
        return true;
      }),
    [items, group, subgroup],
  );

  function selectGroup(next: string | null) {
    setGroup(next);
    setSubgroup(null);
  }

  const isLoading = workouts.isLoading || exercises.isLoading;
  const isError = workouts.isError || exercises.isError;
  const isReady = workouts.isSuccess && !exercises.isLoading;

  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">База знаний</h1>
      <p className="mt-1 text-[13px] text-ink-muted">
        Упражнения, которые тренер давал на тренировках.
      </p>

      <div className="mt-4 flex flex-1 flex-col overflow-y-auto">
        {isLoading && <p className="pt-2 text-sm text-ink-muted">Загрузка…</p>}
        {isError && (
          <p className="pt-2 text-sm text-ink-muted" role="alert">
            Не удалось загрузить. Попробуйте обновить страницу.
          </p>
        )}
        {isReady && items.length === 0 && (
          <p className="pt-2 text-sm text-ink-muted">
            {linked
              ? 'Пока нет упражнений из проведённых тренировок.'
              : 'Подключите тренера — здесь появятся упражнения с ваших тренировок.'}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {filtered.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => void navigate('/knowledge/' + it.id)}
                className="flex w-full flex-col gap-1 rounded-2xl bg-card px-4 py-3 text-left"
              >
                <span className="text-[15px] font-semibold text-ink">{it.name}</span>
                {(it.category ?? it.subgroup) && (
                  <span className="text-[12px] text-ink-muted">
                    {[it.category, it.subgroup].filter(Boolean).join(' · ')}
                  </span>
                )}
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                  {it.overview.isTimeBased
                    ? it.overview.maxTimeSec !== null && (
                        <span>
                          PR <b className="tabular-nums text-ink">{it.overview.maxTimeSec}</b> с
                        </span>
                      )
                    : it.overview.maxWeightKg !== null && (
                        <span>
                          PR <b className="tabular-nums text-ink">{it.overview.maxWeightKg}</b> кг
                        </span>
                      )}
                  {it.overview.lastDate && <span>· {shortDate(it.overview.lastDate)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Фильтры снизу (one-handed): группы мышц, затем подгруппы выбранной группы. */}
      {groups.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
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
