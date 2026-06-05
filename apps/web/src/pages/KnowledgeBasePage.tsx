import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import type { ExerciseResponse, TemplateResponse } from '@trener/shared';
import { useExercises } from '../api/exercises';
import { useTemplates } from '../api/workout-templates';
import { orderSubgroups, subgroupsFor } from '../lib/muscleGroups';

type Tab = 'templates' | 'exercises';

/** Предпочтительный порядок групп мышц для чипов (остальные категории — следом). */
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

function SegmentTab({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center rounded-xl py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-accent text-accent-on' : 'text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

function CategoryChip({
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
      className={`shrink-0 rounded-full px-3 py-1.5 font-mono text-xs transition-colors ${
        active ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

function ExerciseRow({ exercise }: { exercise: ExerciseResponse }) {
  return (
    <Link
      to={`/knowledge/exercises/${exercise.id}/edit`}
      className="shelf row-glow flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-semibold text-ink">{exercise.name}</span>
        <span className="truncate font-mono text-xs text-ink-muted">{exercise.category}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <ChevronRight size={16} className="tile-chevron" />
      </span>
    </Link>
  );
}

export function KnowledgeBasePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('templates');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [templateGroup, setTemplateGroup] = useState('');
  const [subgroup, setSubgroup] = useState('');

  const exercises = useExercises();
  const templates = useTemplates();

  const allExercises = useMemo(() => exercises.data ?? [], [exercises.data]);
  const allTemplates = useMemo(() => templates.data ?? [], [templates.data]);

  // Карта exerciseId → группа мышц (категория) — у шаблона своего поля группы нет.
  const groupByExerciseId = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of allExercises) m.set(e.id, e.category);
    return m;
  }, [allExercises]);

  // Карта exerciseId → подгруппа упражнения (null/'' если не задана).
  const subgroupByExerciseId = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of allExercises) if (e.subgroup) m.set(e.id, e.subgroup);
    return m;
  }, [allExercises]);

  // Чипы вкладки «Тренировки»: группы мышц, встречающиеся в упражнениях шаблонов.
  const templateGroups = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTemplates) {
      for (const ex of t.exercises) {
        const g = groupByExerciseId.get(ex.exerciseId);
        if (g) set.add(g);
      }
    }
    const ordered = GROUP_ORDER.filter((g) => set.has(g));
    const extras = [...set]
      .filter((g) => !GROUP_ORDER.includes(g))
      .sort((a, b) => a.localeCompare(b, 'ru'));
    return [...ordered, ...extras];
  }, [allTemplates, groupByExerciseId]);

  // Все упражнения каталога (вкладка «Упражнения»).
  const tabExercises = allExercises;

  // Чипы категорий — уникальные категории из упражнений.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of tabExercises) set.add(e.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [tabExercises]);

  const q = query.trim().toLowerCase();

  // Подгруппы вкладки «Упражнения»: полный список из таксономии выбранной группы.
  const exerciseSubgroups = category === '' ? [] : subgroupsFor(category);

  const filteredExercises = useMemo(() => {
    return tabExercises.filter((e) => {
      if (category && e.category !== category) return false;
      if (subgroup && e.subgroup !== subgroup) return false;
      if (q.length > 0 && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tabExercises, category, subgroup, q]);

  // Подгруппы вкладки «Тренировки»: из подгрупп упражнений выбранной группы,
  // встречающихся в шаблонах, упорядочены по таксономии.
  const templateSubgroups = useMemo(() => {
    if (templateGroup === '') return [];
    const present = new Set<string>();
    for (const t of allTemplates) {
      for (const ex of t.exercises) {
        if (groupByExerciseId.get(ex.exerciseId) !== templateGroup) continue;
        const sg = subgroupByExerciseId.get(ex.exerciseId);
        if (sg) present.add(sg);
      }
    }
    return orderSubgroups(templateGroup, present);
  }, [allTemplates, templateGroup, groupByExerciseId, subgroupByExerciseId]);

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((t) => {
      if (templateGroup) {
        // Шаблон проходит, если есть упражнение выбранной группы И (подгруппа не
        // выбрана, или у упражнения нет подгруппы, или она совпадает с выбранной).
        const inGroup = t.exercises.some((ex) => {
          if (groupByExerciseId.get(ex.exerciseId) !== templateGroup) return false;
          if (subgroup === '') return true;
          const sg = subgroupByExerciseId.get(ex.exerciseId);
          return !sg || sg === subgroup;
        });
        if (!inGroup) return false;
      }
      if (q.length === 0) return true;
      const inName = t.name.toLowerCase().includes(q);
      const inTag = (t.categoryTag ?? '').toLowerCase().includes(q);
      return inName || inTag;
    });
  }, [allTemplates, q, templateGroup, subgroup, groupByExerciseId, subgroupByExerciseId]);

  function selectTab(next: Tab) {
    setTab(next);
    setCategory('');
    setTemplateGroup('');
    setSubgroup('');
  }

  // Чипы: на вкладке «Тренировки» — группы мышц, иначе — категории упражнений.
  const isTemplates = tab === 'templates';
  const chipItems = isTemplates ? templateGroups : categories;
  const chipValue = isTemplates ? templateGroup : category;
  const setPrimaryChip = isTemplates ? setTemplateGroup : setCategory;
  const showChips = chipItems.length > 0;

  // Смена основной группы сбрасывает выбранную подгруппу.
  function selectChip(value: string) {
    setPrimaryChip(value);
    setSubgroup('');
  }

  const subgroupChips = isTemplates ? templateSubgroups : exerciseSubgroups;
  const showSubgroupChips = chipValue !== '' && subgroupChips.length > 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-2 pt-3">
        <h1 className="text-[32px] font-bold leading-none tracking-[-0.02em] text-ink">
          База знаний
        </h1>

        <div className="relative mt-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск тренировок, упражнений, статей"
            aria-label="Поиск"
            className="shelf w-full rounded-2xl py-3 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>

        <div
          role="tablist"
          aria-label="Разделы базы знаний"
          className="mt-3 flex gap-1 rounded-2xl bg-card-elevated p-1"
        >
          <SegmentTab active={tab === 'templates'} onClick={() => selectTab('templates')}>
            Тренировки
          </SegmentTab>
          <SegmentTab active={tab === 'exercises'} onClick={() => selectTab('exercises')}>
            Упражнения
          </SegmentTab>
        </div>

        {showChips && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <CategoryChip active={chipValue === ''} onClick={() => selectChip('')}>
              Все
            </CategoryChip>
            {chipItems.map((c) => (
              <CategoryChip key={c} active={chipValue === c} onClick={() => selectChip(c)}>
                {c}
              </CategoryChip>
            ))}
          </div>
        )}

        {showSubgroupChips && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CategoryChip active={subgroup === ''} onClick={() => setSubgroup('')}>
              Все
            </CategoryChip>
            {subgroupChips.map((s) => (
              <CategoryChip key={s} active={subgroup === s} onClick={() => setSubgroup(s)}>
                {s}
              </CategoryChip>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-2 pb-6 pt-3">
        {(exercises.isPending || templates.isPending) && (
          <p className="text-sm text-ink-muted">Загрузка…</p>
        )}

        {tab === 'templates' && (
          <>
            {templates.isError && (
              <p className="text-sm text-ink-muted" role="alert">
                Не удалось загрузить тренировки. Попробуйте обновить страницу.
              </p>
            )}
            {templates.isSuccess && filteredTemplates.length === 0 && (
              <p className="text-sm text-ink-muted">
                {allTemplates.length === 0
                  ? 'Пока нет тренировок. Создайте первую.'
                  : 'Ничего не нашлось.'}
              </p>
            )}
            {filteredTemplates.length > 0 && (
              <ul className="flex flex-col gap-2">
                {filteredTemplates.map((t: TemplateResponse) => (
                  <li key={t.id}>
                    <Link
                      to={`/knowledge/templates/${t.id}/edit`}
                      className="shelf row-glow flex items-center gap-3 rounded-2xl px-3 py-3"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip font-mono text-sm font-bold text-ink tabular-nums">
                        {t.exercises.length}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-base font-semibold text-ink">{t.name}</span>
                        <span className="truncate font-mono text-xs text-ink-muted">
                          {t.categoryTag ? `${t.categoryTag} · ` : ''}
                          {t.exercises.length} упр.
                        </span>
                      </span>
                      <ChevronRight size={16} className="tile-chevron shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab !== 'templates' && (
          <>
            {exercises.isError && (
              <p className="text-sm text-ink-muted" role="alert">
                Не удалось загрузить упражнения. Попробуйте обновить страницу.
              </p>
            )}
            {exercises.isSuccess && filteredExercises.length === 0 && (
              <p className="text-sm text-ink-muted">
                {tabExercises.length === 0
                  ? 'Пока нет упражнений. Добавьте первое.'
                  : 'Ничего не нашлось.'}
              </p>
            )}
            {filteredExercises.length > 0 && (
              <ul className="flex flex-col gap-2">
                {filteredExercises.map((e) => (
                  <li key={e.id}>
                    <ExerciseRow exercise={e} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* FAB: создать тренировку (на вкладке «Тренировки») или упражнение. */}
      <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex justify-end px-2">
        <button
          type="button"
          onClick={() =>
            void navigate(isTemplates ? '/knowledge/templates/new' : '/knowledge/exercises/new')
          }
          aria-label={isTemplates ? 'Создать тренировку' : 'Создать упражнение'}
          className="tile-shadow-primary pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full active:scale-[0.95]"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
