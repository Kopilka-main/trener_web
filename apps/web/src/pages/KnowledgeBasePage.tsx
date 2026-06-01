import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ExerciseResponse, TemplateResponse } from '@trener/shared';
import { useExercises } from '../api/exercises';
import { useTemplates } from '../api/workout-templates';

type Tab = 'exercises' | 'templates';

function globalBadge() {
  return (
    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
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
      <input
        type="search"
        placeholder="Поиск по названию"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-500"
        aria-label="Поиск упражнения"
      />

      {categories.length > 0 && (
        <label htmlFor="category-filter" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Категория</span>
          <select
            id="category-filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-500"
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

      {exercises.isPending && <p className="text-sm text-slate-500">Загрузка…</p>}

      {exercises.isError && (
        <p className="text-sm text-slate-500" role="alert">
          Не удалось загрузить упражнения. Попробуйте обновить страницу.
        </p>
      )}

      {exercises.isSuccess && filtered.length === 0 && (
        <p className="text-sm text-slate-500">
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
                className="flex items-center justify-between gap-3 rounded-2xl bg-slate-100 px-4 py-3"
              >
                <span className="flex flex-col">
                  <span className="text-base font-medium text-slate-900">{e.name}</span>
                  <span className="text-sm text-slate-500">{e.category}</span>
                </span>
                {e.isGlobal && globalBadge()}
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
      {templates.isPending && <p className="text-sm text-slate-500">Загрузка…</p>}

      {templates.isError && (
        <p className="text-sm text-slate-500" role="alert">
          Не удалось загрузить шаблоны. Попробуйте обновить страницу.
        </p>
      )}

      {templates.isSuccess && templates.data.length === 0 && (
        <p className="text-sm text-slate-500">Пока нет шаблонов. Создайте первый.</p>
      )}

      {templates.data && templates.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {templates.data.map((t: TemplateResponse) => (
            <li key={t.id}>
              <Link
                to={`/knowledge/templates/${t.id}/edit`}
                className="flex items-center justify-between gap-3 rounded-2xl bg-slate-100 px-4 py-3"
              >
                <span className="flex flex-col">
                  <span className="text-base font-medium text-slate-900">{t.name}</span>
                  {t.categoryTag && <span className="text-sm text-slate-500">{t.categoryTag}</span>}
                </span>
                <span className="text-sm text-slate-500">{t.exercises.length} упр.</span>
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
      <div className="flex flex-col gap-4 px-5 py-6">
        <h1 className="text-2xl font-semibold text-slate-900">База знаний</h1>
        {tab === 'exercises' ? <ExercisesTab /> : <TemplatesTab />}
      </div>

      <div className="sticky bottom-0 z-10 mt-auto flex flex-col gap-3 px-5 pb-4">
        <div className="flex justify-end">
          <Link
            to={fabTo}
            aria-label={fabLabel}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-3xl leading-none text-white shadow-lg"
          >
            +
          </Link>
        </div>
        <div
          role="tablist"
          aria-label="Разделы базы знаний"
          className="flex gap-1 rounded-2xl bg-slate-100 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'exercises'}
            onClick={() => setTab('exercises')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'exercises' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Упражнения
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'templates'}
            onClick={() => setTab('templates')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'templates' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Шаблоны
          </button>
        </div>
      </div>
    </div>
  );
}
