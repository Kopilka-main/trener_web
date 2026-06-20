import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Dumbbell, Plus, Search, X } from 'lucide-react';
import type { ExerciseResponse, TemplateResponse } from '@trener/shared';
import { useExercises } from '../api/exercises';
import { useTemplates } from '../api/workout-templates';
import { orderSubgroups, subgroupsFor } from '../lib/muscleGroups';
import { rankBySearch } from '../lib/search';

type Tab = 'templates' | 'exercises';

// Сохранённое состояние экрана (вкладка/фильтры/скролл) — чтобы при возврате из
// упражнения попадать на ту же вкладку и в то же место списка. sessionStorage:
// живёт в рамках сессии вкладки браузера, не засоряет localStorage.
const VIEW_KEY = 'knowledge.view';
type SavedView = {
  tab: Tab;
  query: string;
  category: string;
  templateGroup: string;
  subgroup: string;
  scrollTop: number;
};
function loadView(): Partial<SavedView> {
  try {
    return JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? '{}') as Partial<SavedView>;
  } catch {
    return {};
  }
}
function saveView(patch: Partial<SavedView>): void {
  sessionStorage.setItem(VIEW_KEY, JSON.stringify({ ...loadView(), ...patch }));
}
/**
 * Кандидаты на скролл-контейнер: внутренний список и каркасный <main>. В зависимости
 * от раскладки реально скроллится один из них — сохраняем/восстанавливаем оба.
 */
function scrollEls(listEl: HTMLElement | null): HTMLElement[] {
  const els: HTMLElement[] = [];
  if (listEl) els.push(listEl);
  const main = document.querySelector('main');
  if (main instanceof HTMLElement && main !== listEl) els.push(main);
  return els;
}

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

/** Превью упражнения: фикс-бокс слева; картинка вписывается внутрь (object-contain),
 * не растягивая строку — вокруг остаётся свободное место. Нет картинки — плейсхолдер. */
function ExerciseThumb({ url, alt }: { url: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const box = 'w-28 shrink-0 self-stretch bg-chip';
  if (url && !failed) {
    return (
      <span className={`${box} relative block overflow-hidden`}>
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </span>
    );
  }
  return (
    <span className={`${box} flex items-center justify-center text-ink-muted`}>
      <Dumbbell size={20} strokeWidth={1.8} />
    </span>
  );
}

/** Иконки параметров подхода (Material Symbols, 13px, наследуют цвет текста). */
const ICON_CLS = 'h-[13px] w-[13px] shrink-0';
function RepsIcon() {
  return (
    <svg viewBox="0 -960 960 960" className={ICON_CLS} fill="currentColor" aria-hidden>
      <path d="M204-318q-22-38-33-78t-11-82q0-134 93-228t227-94h7l-64-64 56-56 160 160-160 160-56-56 64-64h-7q-100 0-170 70.5T240-478q0 26 6 51t18 49l-60 60ZM481-40 321-200l160-160 56 56-64 64h7q100 0 170-70.5T720-482q0-26-6-51t-18-49l60-60q22 38 33 78t11 82q0 134-93 228t-227 94h-7l64 64-56 56Z" />
    </svg>
  );
}
function WeightIcon() {
  return (
    <svg viewBox="0 -960 960 960" className={ICON_CLS} fill="currentColor" aria-hidden>
      <path d="M240-200h480l-57-400H297l-57 400Zm240-480q17 0 28.5-11.5T520-720q0-17-11.5-28.5T480-760q-17 0-28.5 11.5T440-720q0 17 11.5 28.5T480-680Zm113 0h70q30 0 52 20t27 49l57 400q5 36-18.5 63.5T720-120H240q-37 0-60.5-27.5T161-211l57-400q5-29 27-49t52-20h70q-3-10-5-19.5t-2-20.5q0-50 35-85t85-35q50 0 85 35t35 85q0 11-2 20.5t-5 19.5ZM240-200h480-480Z" />
    </svg>
  );
}
function TimeIcon() {
  return (
    <svg viewBox="0 -960 960 960" className={ICON_CLS} fill="currentColor" aria-hidden>
      <path d="M203-480h117q11 0 21 5.5t15 16.5l44 88 124-248q11-23 36-23t36 23l69 138h92q-15-102-93-171t-184-69q-106 0-184 69t-93 171Zm461 251q78-69 93-171H640q-11 0-21-5.5T604-422l-44-88-124 248q-11 23-36 23t-36-23l-69-138h-92q15 102 93 171t184 69q106 0 184-69ZM340.5-108.5Q275-137 226-186t-77.5-114.5Q120-366 120-440h80q0 116 82 198t198 82q116 0 198-82t82-198h80q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80q-74 0-139.5-28.5ZM120-440q0-74 28.5-139.5T226-694q49-49 114.5-77.5T480-800q62 0 119 20t107 58l56-56 56 56-56 56q38 50 58 107t20 119h-80q0-116-82-198t-198-82q-116 0-198 82t-82 198h-80Zm240-400v-80h240v80H360Zm-78 598q-82-82-82-198t82-198q82-82 198-82t198 82q82 82 82 198t-82 198q-82 82-198 82t-198-82Zm198-198Z" />
    </svg>
  );
}
function RestIcon() {
  return (
    <svg viewBox="0 -960 960 960" className={ICON_CLS} fill="currentColor" aria-hidden>
      <path d="M380-334h200v-60H468l112-126v-54H380v60h114L380-386v52Zm-40.5 225.5q-65.5-28.5-114-77t-77-114Q120-365 120-440t28.5-140.5q28.5-65.5 77-114t114-77Q405-800 480-800t140.5 28.5q65.5 28.5 114 77t77 114Q840-515 840-440t-28.5 140.5q-28.5 65.5-77 114t-114 77Q555-80 480-80t-140.5-28.5ZM480-440ZM224-866l56 56-170 170-56-56 170-170Zm512 0 170 170-56 56-170-170 56-56ZM480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720q-117 0-198.5 81.5T200-440q0 117 81.5 198.5T480-160Z" />
    </svg>
  );
}

function ExerciseRow({ exercise }: { exercise: ExerciseResponse }) {
  return (
    <Link
      to={`/knowledge/exercises/${exercise.id}/edit`}
      className="shelf row-glow flex min-h-[84px] items-stretch overflow-hidden rounded-2xl"
    >
      <ExerciseThumb url={exercise.thumbUrl ?? exercise.imageUrl} alt={exercise.name} />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-3">
        <span className="line-clamp-2 text-base font-semibold leading-snug text-ink">
          {exercise.name}
        </span>
        <span className="flex items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[11px] text-ink-muted">
          <span className="shrink-0">{exercise.category}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <RepsIcon />
            {exercise.defaultReps ?? 0}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <WeightIcon />
            {exercise.defaultWeightKg ?? 0}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <TimeIcon />
            {exercise.defaultTimeSec ?? 0}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <RestIcon />
            {exercise.restSec}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center pr-3">
        <ChevronRight size={16} className="tile-chevron" />
      </span>
    </Link>
  );
}

export function KnowledgeBasePage() {
  const navigate = useNavigate();
  const saved = useMemo(loadView, []);
  const [tab, setTab] = useState<Tab>(saved.tab ?? 'templates');
  const [query, setQuery] = useState(saved.query ?? '');
  const [category, setCategory] = useState(saved.category ?? '');
  const [templateGroup, setTemplateGroup] = useState(saved.templateGroup ?? '');
  const [subgroup, setSubgroup] = useState(saved.subgroup ?? '');

  const exercises = useExercises();
  const templates = useTemplates();
  const listRef = useRef<HTMLDivElement | null>(null);

  // Сохраняем вкладку и фильтры при каждом изменении.
  useEffect(() => {
    saveView({ tab, query, category, templateGroup, subgroup });
  }, [tab, query, category, templateGroup, subgroup]);

  // Сохраняем позицию скролла по мере прокрутки (того контейнера, что реально скроллится).
  useEffect(() => {
    const els = scrollEls(listRef.current);
    if (els.length === 0) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const top = Math.max(...els.map((e) => e.scrollTop));
        saveView({ scrollTop: top });
      });
    };
    els.forEach((e) => e.addEventListener('scroll', onScroll, { passive: true }));
    return () => {
      els.forEach((e) => e.removeEventListener('scroll', onScroll));
      cancelAnimationFrame(raf);
    };
  }, []);

  // Восстанавливаем позицию, когда данные готовы (с ретраями — список тянется по высоте).
  const dataReady = !exercises.isPending && !templates.isPending;
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !dataReady) return;
    restored.current = true;
    const top = loadView().scrollTop ?? 0;
    if (top <= 0) return;
    let tries = 0;
    const apply = () => {
      const els = scrollEls(listRef.current);
      els.forEach((e) => (e.scrollTop = top));
      tries += 1;
      const reached = els.some((e) => Math.abs(e.scrollTop - top) <= 2);
      if (!reached && tries < 30) requestAnimationFrame(apply);
    };
    requestAnimationFrame(apply);
  }, [dataReady]);

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

  // Подгруппы вкладки «Упражнения»: полный список из таксономии выбранной группы.
  const exerciseSubgroups = category === '' ? [] : subgroupsFor(category);

  const filteredExercises = useMemo(() => {
    const base = tabExercises.filter((e) => {
      if (category && e.category !== category) return false;
      if (subgroup && e.subgroup !== subgroup) return false;
      return true;
    });
    // Поиск по словам с нормализацией (ё/е), префиксами и опечатками + ранжирование.
    return rankBySearch(base, query, (e) => e.name);
  }, [tabExercises, category, subgroup, query]);

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
    const base = allTemplates.filter((t) => {
      if (!templateGroup) return true;
      // Шаблон проходит, если есть упражнение выбранной группы И (подгруппа не
      // выбрана, или у упражнения нет подгруппы, или она совпадает с выбранной).
      return t.exercises.some((ex) => {
        if (groupByExerciseId.get(ex.exerciseId) !== templateGroup) return false;
        if (subgroup === '') return true;
        const sg = subgroupByExerciseId.get(ex.exerciseId);
        return !sg || sg === subgroup;
      });
    });
    // Поиск по названию и тегу типа с нормализацией/опечатками + ранжирование.
    return rankBySearch(base, query, (t) => `${t.name} ${t.categoryTag ?? ''}`);
  }, [allTemplates, query, templateGroup, subgroup, groupByExerciseId, subgroupByExerciseId]);

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
            className="shelf w-full rounded-2xl py-3 pl-10 pr-10 text-sm text-ink outline-none placeholder:text-ink-muted"
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

      <div ref={listRef} className="flex-1 overflow-y-auto px-2 pb-6 pt-3">
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
