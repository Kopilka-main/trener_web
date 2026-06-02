import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import type { ExerciseResponse, TemplateResponse } from '@trener/shared';
import { useExercises } from '../api/exercises';
import { useTemplates } from '../api/workout-templates';

type Tab = 'templates' | 'exercises' | 'flex';

/** Категории, относящиеся к вкладке «Растяжка» (растяжка/кардио/йога). */
const FLEX_HINTS = ['растяж', 'кардио', 'йог', 'stretch', 'cardio', 'yoga'];

function isFlexCategory(category: string): boolean {
  const c = category.toLowerCase();
  return FLEX_HINTS.some((h) => c.includes(h));
}

function CreateTile({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tile-shadow relative flex h-[112px] flex-col items-start justify-end rounded-2xl p-3 text-left active:scale-[0.98]"
    >
      <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-chip text-ink">
        <Plus size={16} strokeWidth={2.2} />
      </span>
      <span className="text-[14px] font-semibold leading-tight text-ink">{title}</span>
      <span className="mt-0.5 text-[11px] text-ink-muted">{sub}</span>
    </button>
  );
}

function SegmentTab({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-accent text-accent-on' : 'text-ink-muted'
      }`}
    >
      <span>{children}</span>
      <span className="font-mono text-[12px] tabular-nums">{count}</span>
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

  const exercises = useExercises();
  const templates = useTemplates();

  const allExercises = useMemo(() => exercises.data ?? [], [exercises.data]);
  const allTemplates = useMemo(() => templates.data ?? [], [templates.data]);

  const powerExercises = useMemo(
    () => allExercises.filter((e) => !isFlexCategory(e.category)),
    [allExercises],
  );
  const flexExercises = useMemo(
    () => allExercises.filter((e) => isFlexCategory(e.category)),
    [allExercises],
  );
  const hasFlex = flexExercises.length > 0;

  // Упражнения активной вкладки (Упражнения = силовые, Растяжка = flex).
  const tabExercises = tab === 'flex' ? flexExercises : powerExercises;

  // Чипы категорий — уникальные категории из упражнений активной вкладки.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of tabExercises) set.add(e.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [tabExercises]);

  const q = query.trim().toLowerCase();

  const filteredExercises = useMemo(() => {
    return tabExercises.filter((e) => {
      if (category && e.category !== category) return false;
      if (q.length > 0 && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tabExercises, category, q]);

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((t) => {
      if (q.length === 0) return true;
      const inName = t.name.toLowerCase().includes(q);
      const inTag = (t.categoryTag ?? '').toLowerCase().includes(q);
      return inName || inTag;
    });
  }, [allTemplates, q]);

  function selectTab(next: Tab) {
    setTab(next);
    setCategory('');
  }

  const showChips = tab !== 'templates' && categories.length > 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-5 pt-3">
        <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-none tracking-[-0.02em] text-ink">
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

        <div className="mt-3 grid grid-cols-2 gap-3">
          <CreateTile
            title="Создать тренировку"
            sub="набор упражнений"
            onClick={() => void navigate('/knowledge/templates/new')}
          />
          <CreateTile
            title="Создать упражнение"
            sub="карточка с настройками"
            onClick={() => void navigate('/knowledge/exercises/new')}
          />
        </div>

        <div
          role="tablist"
          aria-label="Разделы базы знаний"
          className="mt-3 flex gap-1 rounded-2xl bg-card-elevated p-1"
        >
          <SegmentTab
            active={tab === 'templates'}
            onClick={() => selectTab('templates')}
            count={filteredTemplates.length}
          >
            Тренировки
          </SegmentTab>
          <SegmentTab
            active={tab === 'exercises'}
            onClick={() => selectTab('exercises')}
            count={powerExercises.length}
          >
            Упражнения
          </SegmentTab>
          {hasFlex && (
            <SegmentTab
              active={tab === 'flex'}
              onClick={() => selectTab('flex')}
              count={flexExercises.length}
            >
              Растяжка
            </SegmentTab>
          )}
        </div>

        {showChips && (
          <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1">
            <CategoryChip active={category === ''} onClick={() => setCategory('')}>
              Все
            </CategoryChip>
            {categories.map((c) => (
              <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </CategoryChip>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-3">
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
    </div>
  );
}
