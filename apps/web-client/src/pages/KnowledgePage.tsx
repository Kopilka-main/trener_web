import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Dumbbell, Search } from 'lucide-react';
import type { ExerciseResponse } from '@trener/shared';
import { useClientMe } from '../api/auth';
import { useClientWorkouts } from '../api/workouts';
import { useClientExercises } from '../api/exercises';
import { aggregateExerciseOverview, type ExerciseOverview } from '../lib/workout-stats';
import { orderSubgroups } from '../lib/muscleGroups';

type Tab = 'workouts' | 'exercises';

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

/** Предпочтительный порядок групп мышц для чипов (остальные — следом, по алфавиту). */
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

function orderGroups(present: Set<string>): string[] {
  const ordered = GROUP_ORDER.filter((g) => present.has(g));
  const extras = [...present]
    .filter((g) => !GROUP_ORDER.includes(g))
    .sort((a, b) => a.localeCompare(b, 'ru'));
  return [...ordered, ...extras];
}

/** Элемент вкладки «Упражнения»: упражнение с тренировки, обогащённое каталогом тренера. */
interface KnowledgeExercise {
  id: string;
  name: string;
  category: string | null;
  subgroup: string | null;
  imageUrl: string | null;
  overview: ExerciseOverview;
}

/** Превью упражнения: заполняет левую часть карточки во всю высоту (object-cover),
 * без отступов; любой формат вписывается. Нет картинки — плейсхолдер. */
function ExerciseThumb({ url, alt }: { url: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const box = 'w-24 shrink-0 self-stretch bg-chip';
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
    <span className={`${box} flex items-center justify-center text-ink-mutedxl`}>
      <Dumbbell size={20} strokeWidth={1.8} />
    </span>
  );
}

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

function Chip({
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
      className={`shrink-0 rounded-full px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs transition-colors ${
        active ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

/** База знаний клиента — зеркало тренерской: поиск, табы «Тренировки/Упражнения»,
 * чипы групп мышц и подгрупп. Тренировки — проведённые тренером; упражнения — с
 * проведённых тренировок, обогащённые каталогом тренера. Read-only. */
export function KnowledgePage() {
  const navigate = useNavigate();
  const me = useClientMe();
  const linked = me.data?.link != null;
  const workouts = useClientWorkouts();
  const exercises = useClientExercises();

  const [tab, setTab] = useState<Tab>('workouts');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [subgroup, setSubgroup] = useState('');

  const q = query.trim().toLowerCase();

  // Каталог тренера: exerciseId → запись (имя/группа/подгруппа).
  const catalog = useMemo(() => {
    const map = new Map<string, ExerciseResponse>();
    for (const ex of exercises.data ?? []) map.set(ex.id, ex);
    return map;
  }, [exercises.data]);

  // ─── Вкладка «Тренировки» — проведённые тренером (не созданные клиентом) ───
  const trainerWorkouts = useMemo(() => {
    const list = (workouts.data ?? []).filter((w) => !w.createdByClient);
    return [...list].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  }, [workouts.data]);

  // Группы мышц тренировки берём из каталога по exerciseId.
  const workoutGroupChips = useMemo(() => {
    const present = new Set<string>();
    for (const w of trainerWorkouts) {
      for (const ex of w.exercises) {
        const cat = catalog.get(ex.exerciseId)?.category;
        if (cat) present.add(cat);
      }
    }
    return orderGroups(present);
  }, [trainerWorkouts, catalog]);

  const workoutSubgroupChips = useMemo(() => {
    if (group === '') return [];
    const present = new Set<string>();
    for (const w of trainerWorkouts) {
      for (const ex of w.exercises) {
        const entry = catalog.get(ex.exerciseId);
        if (entry?.category === group && entry.subgroup) present.add(entry.subgroup);
      }
    }
    return orderSubgroups(group, present);
  }, [trainerWorkouts, group, catalog]);

  const filteredWorkouts = useMemo(() => {
    return trainerWorkouts.filter((w) => {
      if (group) {
        const inGroup = w.exercises.some((ex) => {
          const entry = catalog.get(ex.exerciseId);
          if (entry?.category !== group) return false;
          if (subgroup === '') return true;
          return !entry.subgroup || entry.subgroup === subgroup;
        });
        if (!inGroup) return false;
      }
      if (q.length > 0 && !w.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [trainerWorkouts, group, subgroup, q, catalog]);

  // ─── Вкладка «Упражнения» — с проведённых тренировок ───
  const exerciseItems = useMemo<KnowledgeExercise[]>(() => {
    const overview = aggregateExerciseOverview(workouts.data ?? []);
    return overview.map((ov) => {
      const entry = catalog.get(ov.exerciseId);
      return {
        id: ov.exerciseId,
        name: entry?.name ?? ov.name,
        category: entry?.category ?? null,
        subgroup: entry?.subgroup ?? null,
        imageUrl: entry?.imageUrl ?? null,
        overview: ov,
      };
    });
  }, [workouts.data, catalog]);

  const exerciseGroupChips = useMemo(() => {
    const present = new Set<string>();
    for (const it of exerciseItems) if (it.category) present.add(it.category);
    return orderGroups(present);
  }, [exerciseItems]);

  const exerciseSubgroupChips = useMemo(() => {
    if (group === '') return [];
    const present = new Set<string>();
    for (const it of exerciseItems)
      if (it.category === group && it.subgroup) present.add(it.subgroup);
    return orderSubgroups(group, present);
  }, [exerciseItems, group]);

  const filteredExercises = useMemo(() => {
    return exerciseItems.filter((it) => {
      if (group && it.category !== group) return false;
      if (subgroup && it.subgroup !== subgroup) return false;
      if (q.length > 0 && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exerciseItems, group, subgroup, q]);

  // ─── Общее ───
  function selectTab(next: Tab) {
    setTab(next);
    setGroup('');
    setSubgroup('');
  }
  function selectGroup(value: string) {
    setGroup(value);
    setSubgroup('');
  }

  const isWorkouts = tab === 'workouts';
  const groupChips = isWorkouts ? workoutGroupChips : exerciseGroupChips;
  const subgroupChips = isWorkouts ? workoutSubgroupChips : exerciseSubgroupChips;
  const isLoading = workouts.isLoading || exercises.isLoading;
  const isError = workouts.isError || exercises.isError;

  return (
    <div className="flex h-full flex-col">
      <header className="px-2 pt-5">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] text-ink">База знаний</h1>

        <div className="relative mt-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск тренировок, упражнений"
            aria-label="Поиск"
            className="w-full rounded-2xl bg-card py-3 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div
          role="tablist"
          aria-label="Разделы базы знаний"
          className="mt-3 flex gap-1 rounded-2xl bg-card-elevated p-1"
        >
          <SegmentTab active={isWorkouts} onClick={() => selectTab('workouts')}>
            Тренировки
          </SegmentTab>
          <SegmentTab active={!isWorkouts} onClick={() => selectTab('exercises')}>
            Упражнения
          </SegmentTab>
        </div>

        {groupChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip active={group === ''} onClick={() => selectGroup('')}>
              Все
            </Chip>
            {groupChips.map((g) => (
              <Chip key={g} active={group === g} onClick={() => selectGroup(g)}>
                {g}
              </Chip>
            ))}
          </div>
        )}

        {group !== '' && subgroupChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={subgroup === ''} onClick={() => setSubgroup('')}>
              Все
            </Chip>
            {subgroupChips.map((s) => (
              <Chip key={s} active={subgroup === s} onClick={() => setSubgroup(s)}>
                {s}
              </Chip>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-2 pb-6 pt-3">
        {isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
        {isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось загрузить. Попробуйте обновить страницу.
          </p>
        )}

        {!isLoading && isWorkouts && (
          <>
            {filteredWorkouts.length === 0 && (
              <p className="text-sm text-ink-muted">
                {trainerWorkouts.length === 0
                  ? linked
                    ? 'Пока нет тренировок от тренера.'
                    : 'Подключите тренера — здесь появятся проведённые им тренировки.'
                  : 'Ничего не нашлось.'}
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {filteredWorkouts.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => void navigate(`/workouts/${w.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-3 text-left active:bg-card-elevated"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums text-ink">
                      {w.exercises.length}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold text-ink">{w.name}</span>
                      <span className="truncate font-[family-name:var(--font-mono)] text-xs text-ink-muted">
                        {w.completedAt ? `${shortDate(w.completedAt)} · ` : ''}
                        {w.exercises.length} упр.
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-ink-mutedxl" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {!isLoading && !isWorkouts && (
          <>
            {filteredExercises.length === 0 && (
              <p className="text-sm text-ink-muted">
                {exerciseItems.length === 0
                  ? linked
                    ? 'Пока нет упражнений из проведённых тренировок.'
                    : 'Подключите тренера — здесь появятся упражнения с ваших тренировок.'
                  : 'Ничего не нашлось.'}
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {filteredExercises.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => void navigate('/knowledge/' + it.id)}
                    className="flex min-h-[84px] w-full items-stretch overflow-hidden rounded-2xl bg-card text-left active:bg-card-elevated"
                  >
                    <ExerciseThumb url={it.imageUrl} alt={it.name} />
                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-3">
                      <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
                        {it.name}
                      </span>
                      {(it.category ?? it.subgroup) && (
                        <span className="truncate text-[12px] text-ink-muted">
                          {[it.category, it.subgroup].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                        {it.overview.isTimeBased
                          ? it.overview.maxTimeSec !== null && (
                              <span>
                                PR <b className="tabular-nums text-ink">{it.overview.maxTimeSec}</b>{' '}
                                с
                              </span>
                            )
                          : it.overview.maxWeightKg !== null && (
                              <span>
                                PR{' '}
                                <b className="tabular-nums text-ink">{it.overview.maxWeightKg}</b>{' '}
                                кг
                              </span>
                            )}
                        {it.overview.lastDate && <span>· {shortDate(it.overview.lastDate)}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
