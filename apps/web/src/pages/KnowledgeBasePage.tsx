import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import type { ExerciseResponse, TemplateResponse } from '@trener/shared';
import { useExercises } from '../api/exercises';
import { useTemplates } from '../api/workout-templates';
import { ScreenHeader } from '../components/ScreenHeader';

type Tab = 'exercises' | 'templates';

function globalBadge() {
  return (
    <span className="shrink-0 rounded-full bg-card-elevated px-2 py-0.5 text-xs font-medium text-ink-muted">
      Глобальное
    </span>
  );
}

function ExercisesTab() {
  const exercises = useExercises();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of exercises.data ?? []) set.add(e.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [exercises.data]);

  const filtered = useMemo(() => {
    const list = exercises.data ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((e: ExerciseResponse) => {
      if (category && e.category !== category) return false;
      if (q.length > 0 && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises.data, query, category]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          placeholder="Поиск по названию"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="shelf w-full rounded-2xl py-3 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-muted"
          aria-label="Поиск упражнения"
        />
      </div>

      {categories.length > 0 && (
        <label htmlFor="category-filter" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Категория</span>
          <select
            id="category-filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
          >
            <option value="">Все</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}

      {exercises.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}

      {exercises.isError && (
        <p className="text-sm text-ink-muted" role="alert">
          Не удалось загрузить упражнения. Попробуйте обновить страницу.
        </p>
      )}

      {exercises.isSuccess && filtered.length === 0 && (
        <p className="text-sm text-ink-muted">
          {exercises.data.length === 0
            ? 'Пока нет упражнений. Добавьте первое.'
            : 'Ничего не нашлось.'}
        </p>
      )}

      {filtered.length > 0 && (
        <ul className="flex flex-col gap-2">
          {filtered.map((e) => (
            <li key={e.id}>
              <Link
                to={`/knowledge/exercises/${e.id}/edit`}
                className="row-glow flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 transition-colors active:bg-card-elevated"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base font-semibold text-ink">{e.name}</span>
                  <span className="truncate text-sm text-ink-muted">{e.category}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {e.isGlobal && globalBadge()}
                  <ChevronRight size={16} className="tile-chevron" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplatesTab() {
  const templates = useTemplates();

  return (
    <div className="flex flex-col gap-4">
      {templates.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}

      {templates.isError && (
        <p className="text-sm text-ink-muted" role="alert">
          Не удалось загрузить шаблоны. Попробуйте обновить страницу.
        </p>
      )}

      {templates.isSuccess && templates.data.length === 0 && (
        <p className="text-sm text-ink-muted">Пока нет шаблонов. Создайте первый.</p>
      )}

      {templates.data && templates.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {templates.data.map((t: TemplateResponse) => (
            <li key={t.id}>
              <Link
                to={`/knowledge/templates/${t.id}/edit`}
                className="row-glow flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 transition-colors active:bg-card-elevated"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base font-semibold text-ink">{t.name}</span>
                  {t.categoryTag && (
                    <span className="truncate text-sm text-ink-muted">{t.categoryTag}</span>
                  )}
                </span>
                <span className="shrink-0 text-sm text-ink-muted">{t.exercises.length} упр.</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function KnowledgeBasePage() {
  const [tab, setTab] = useState<Tab>('exercises');

  const fabTo = tab === 'exercises' ? '/knowledge/exercises/new' : '/knowledge/templates/new';
  const fabLabel = tab === 'exercises' ? 'Добавить упражнение' : 'Создать шаблон';

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="База знаний" back="/" />
      <div className="flex flex-col gap-4 px-5 pb-6 pt-2">
        {tab === 'exercises' ? <ExercisesTab /> : <TemplatesTab />}
      </div>

      <div className="sticky bottom-0 z-10 mt-auto flex flex-col gap-3 bg-gradient-to-t from-bg via-bg to-transparent px-5 pb-4 pt-4">
        <div className="flex justify-end">
          <Link
            to={fabTo}
            aria-label={fabLabel}
            className="tile-shadow-primary flex h-14 w-14 items-center justify-center rounded-full active:scale-[0.95]"
          >
            <Plus size={24} strokeWidth={2.2} />
          </Link>
        </div>
        <div
          role="tablist"
          aria-label="Разделы базы знаний"
          className="flex gap-1 rounded-2xl bg-card-elevated p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'exercises'}
            onClick={() => setTab('exercises')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === 'exercises' ? 'bg-accent text-accent-on' : 'text-ink-muted'
            }`}
          >
            Упражнения
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'templates'}
            onClick={() => setTab('templates')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === 'templates' ? 'bg-accent text-accent-on' : 'text-ink-muted'
            }`}
          >
            Шаблоны
          </button>
        </div>
      </div>
    </div>
  );
}
