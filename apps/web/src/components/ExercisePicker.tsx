import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, Info, Search, X } from 'lucide-react';
import type { ExerciseResponse } from '@trener/shared';
import { useExercises } from '../api/exercises';
import { subgroupsFor } from '../lib/muscleGroups';
import { rankBySearch } from '../lib/search';
import { ExerciseDetails } from './ExerciseDetails';

/** Предпочтительный порядок групп мышц для чипов (как в «Сборке тренировки»). */
const GROUP_ORDER = [
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

/** Целевые мышцы по категории (в API упражнения нет — выводим, как в исходном MVP). */
const MUSCLES_BY_CATEGORY: Record<string, string[]> = {
  Грудь: ['Грудные', 'Передняя дельта', 'Трицепс'],
  Спина: ['Широчайшие', 'Средняя часть спины', 'Трапеции', 'Бицепс'],
  Ноги: ['Квадрицепс', 'Бицепс бедра', 'Ягодицы', 'Икры'],
  Плечи: ['Передняя дельта', 'Средняя дельта', 'Задняя дельта', 'Трапеции'],
  Руки: ['Бицепс', 'Трицепс', 'Брахиалис', 'Предплечья'],
  Корпус: ['Прямая мышца живота', 'Косые', 'Поперечная'],
  'Пресс/Кор': ['Прямая мышца живота', 'Косые', 'Поперечная'],
  Кардио: ['Квадрицепс', 'Бицепс бедра', 'Ягодицы', 'Икры'],
  Растяжка: ['Бицепс бедра', 'Ягодицы', 'Грудные', 'Широчайшие'],
  Йога: ['Корпус', 'Грудные', 'Ягодицы'],
};

function musclesFor(category: string): string {
  const m = MUSCLES_BY_CATEGORY[category];
  return m ? m.slice(0, 3).join(', ') : category;
}

/** Квадратная миниатюра упражнения (фото или плейсхолдер-гантель). */
function ExerciseThumb({ url, alt }: { url: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const box = 'h-12 w-12 shrink-0 rounded-lg bg-chip';
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${box} object-cover`}
      />
    );
  }
  return (
    <span className={`${box} flex items-center justify-center text-ink-muted`}>
      <Dumbbell size={18} strokeWidth={1.8} />
    </span>
  );
}

/**
 * Выбор упражнения в стиле «Сборки тренировки»: чипы групп мышц и подгрупп, поиск,
 * строки с миниатюрой и кнопкой «ℹ» (краткое описание). Тап по строке — выбор
 * упражнения (`onPick`). Селекта с количеством здесь нет — одно касание добавляет.
 */
export function ExercisePicker({
  onPick,
  pending,
}: {
  onPick: (exercise: ExerciseResponse) => void;
  pending?: boolean;
}) {
  const catalog = useExercises();
  const [group, setGroup] = useState<string | null>(null);
  const [subgroup, setSubgroup] = useState('');
  const [query, setQuery] = useState('');
  const [infoEx, setInfoEx] = useState<ExerciseResponse | null>(null);

  // Группы мышц — из реальных категорий каталога, в предпочтительном порядке.
  const groups = useMemo(() => {
    const set = new Set((catalog.data ?? []).map((e) => e.category));
    const ordered = GROUP_ORDER.filter((g) => set.has(g));
    const extras = [...set]
      .filter((g) => !GROUP_ORDER.includes(g))
      .sort((a, b) => a.localeCompare(b));
    return [...ordered, ...extras];
  }, [catalog.data]);

  // По умолчанию выбрана первая группа.
  useEffect(() => {
    if (group === null && groups.length > 0) setGroup(groups[0] ?? null);
  }, [group, groups]);

  const subgroupChips = group ? subgroupsFor(group) : [];
  const groupExercises = useMemo(
    () => (catalog.data ?? []).filter((e) => e.category === group),
    [catalog.data, group],
  );
  const visible = useMemo(() => {
    const base =
      subgroup === '' ? groupExercises : groupExercises.filter((e) => e.subgroup === subgroup);
    return rankBySearch(base, query, (e) => e.name);
  }, [groupExercises, subgroup, query]);

  function selectGroup(g: string) {
    setGroup(g);
    setSubgroup('');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Чипы групп и подгрупп + поиск — закреплены сверху. */}
      <div className="flex shrink-0 flex-col gap-2 px-5 pb-2">
        {catalog.isPending && <p className="text-sm text-ink-muted">Загрузка каталога…</p>}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => {
              const active = g === group;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => selectGroup(g)}
                  className={`rounded-full px-4 py-2 text-[14px] font-semibold transition-colors ${
                    active ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        )}
        {subgroupChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSubgroup('')}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                subgroup === '' ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
              }`}
            >
              Все
            </button>
            {subgroupChips.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubgroup(s)}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                  subgroup === s ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск упражнения"
            aria-label="Поиск упражнения"
            className="shelf w-full rounded-2xl py-2.5 pl-9 pr-9 text-sm text-ink outline-none placeholder:text-ink-muted"
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

      {/* Список упражнений — скроллится. */}
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 pb-2 pt-1">
        {catalog.isError && (
          <li className="text-sm text-ink-muted" role="alert">
            Не удалось загрузить упражнения.
          </li>
        )}
        {catalog.isSuccess && visible.length === 0 && (
          <li className="rounded-2xl bg-card py-6 text-center text-sm text-ink-muted">
            Ничего не найдено.
          </li>
        )}
        {visible.map((ex) => (
          <li key={ex.id} className="flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => onPick(ex)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
            >
              <ExerciseThumb url={ex.thumbUrl ?? ex.imageUrl} alt={ex.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">{ex.name}</span>
                <span className="block truncate text-[12px] text-ink-muted">
                  {musclesFor(ex.category)}
                </span>
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
          </li>
        ))}
      </ul>

      {infoEx && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
          onClick={() => setInfoEx(null)}
          role="presentation"
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-bg p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={infoEx.name}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[18px] font-bold leading-tight text-ink">{infoEx.name}</h2>
                <p className="mt-0.5 text-[13px] text-ink-muted">{musclesFor(infoEx.category)}</p>
              </div>
              <button
                type="button"
                onClick={() => setInfoEx(null)}
                aria-label="Закрыть"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-ink-muted active:scale-95"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <ExerciseDetails exercise={infoEx} />
          </div>
        </div>
      )}
    </div>
  );
}
