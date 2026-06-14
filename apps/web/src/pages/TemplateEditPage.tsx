import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, Dumbbell, Info, Minus, Plus, Search, X } from 'lucide-react';
import type { CreateTemplateRequest, ExerciseResponse, TemplateExercise } from '@trener/shared';
import { useExercises } from '../api/exercises';
import {
  useTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from '../api/workout-templates';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { SortableList } from '../components/SortableList';
import { HoldToDelete } from '../components/HoldToDelete';
import { ExerciseDetails } from '../components/ExerciseDetails';
import { subgroupsFor } from '../lib/muscleGroups';
import { rankBySearch } from '../lib/search';

interface TemplateEditPageProps {
  mode: 'create' | 'edit';
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

/** Варианты «Тип» тренировки. */
const TEMPLATE_TAGS = [
  'Сила',
  'Гипертрофия',
  'Push',
  'Pull',
  'Восстановительная',
  'Кардио',
  'Кроссфит',
  'Йога',
  'Реабилитация',
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

/** Квадратная миниатюра упражнения (как в «Базе знаний»): фото или плейсхолдер. */
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

let entrySeq = 0;
const nextId = () => `e${String(++entrySeq)}`;

/**
 * Карточка = одно вхождение упражнения в тренировку (один подход).
 * Количество подходов = число карточек одного упражнения. Значения — строками
 * для удобного ввода.
 */
interface Draft {
  id: string;
  exerciseId: string;
  name: string;
  category: string;
  reps: string;
  weightKg: string;
  timeSec: string;
  restSec: string;
  /** Упражнение «на время» (есть время, нет повторов) — показываем поле «Сек». */
  timeBased: boolean;
}

function parseOptNum(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function draftFromExercise(ex: ExerciseResponse): Draft {
  return {
    id: nextId(),
    exerciseId: ex.id,
    name: ex.name,
    category: ex.category,
    reps: ex.defaultReps?.toString() ?? '',
    weightKg: ex.defaultWeightKg?.toString() ?? '',
    timeSec: ex.defaultTimeSec?.toString() ?? '',
    restSec: ex.restSec.toString(),
    timeBased: ex.defaultTimeSec !== null && ex.defaultReps === null,
  };
}

export function TemplateEditPage({ mode }: TemplateEditPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const editing = mode === 'edit';

  const catalog = useExercises();
  // Полные данные упражнений по id — для блока «Показать больше» в карточках.
  const exById = useMemo(() => new Map((catalog.data ?? []).map((e) => [e.id, e])), [catalog.data]);
  // Раскрытые карточки (по id позиции) — демонстрация/характеристики/описание.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const existing = useTemplate(editing ? id : '');
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate(id);
  const deleteMutation = useDeleteTemplate();
  const mutation = editing ? updateMutation : createMutation;

  const [step, setStep] = useState<1 | 2>(editing ? 2 : 1);
  const [name, setName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [categoryTag, setCategoryTag] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [subgroup, setSubgroup] = useState('');
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [positions, setPositions] = useState<Draft[]>([]);
  // Упражнение для модалки «краткая информация» (кнопка «i» в строке пикера).
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

  // По умолчанию выбрана первая группа (как в макете — «Грудь»).
  useEffect(() => {
    if (group === null && groups.length > 0) setGroup(groups[0] ?? null);
  }, [group, groups]);

  // Загрузка существующего шаблона: подходы разворачиваются в отдельные карточки.
  useEffect(() => {
    if (editing && existing.data) {
      const t = existing.data;
      setName(t.name);
      setShortDescription(t.shortDescription ?? '');
      setCategoryTag(t.categoryTag);
      setPositions(
        t.exercises.flatMap((p) =>
          Array.from({ length: Math.max(1, p.sets) }, () => ({
            id: nextId(),
            exerciseId: p.exerciseId,
            name: p.exerciseName,
            category: catalog.data?.find((e) => e.id === p.exerciseId)?.category ?? '',
            reps: p.reps?.toString() ?? '',
            weightKg: p.weightKg?.toString() ?? '',
            timeSec: p.timeSec?.toString() ?? '',
            restSec: p.restSec.toString(),
            timeBased: p.timeSec !== null && p.reps === null,
          })),
        ),
      );
    }
  }, [editing, existing.data, catalog.data]);

  const countByExercise = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of positions) map.set(p.exerciseId, (map.get(p.exerciseId) ?? 0) + 1);
    return map;
  }, [positions]);

  const groupExercises = useMemo(
    () => (catalog.data ?? []).filter((e) => e.category === group),
    [catalog.data, group],
  );

  // Подгруппы — полный список из таксономии выбранной группы.
  const subgroupChips = group ? subgroupsFor(group) : [];

  // Отфильтрованный по подгруппе список, плюс поиск по названию (ё/е, слова, опечатки).
  const visibleExercises = useMemo(() => {
    const base =
      subgroup === '' ? groupExercises : groupExercises.filter((e) => e.subgroup === subgroup);
    return rankBySearch(base, exerciseQuery, (e) => e.name);
  }, [groupExercises, subgroup, exerciseQuery]);

  function selectGroup(g: string) {
    setGroup(g);
    setSubgroup('');
  }

  function toggleExercise(ex: ExerciseResponse) {
    setPositions((prev) =>
      prev.some((p) => p.exerciseId === ex.id)
        ? prev.filter((p) => p.exerciseId !== ex.id)
        : [...prev, draftFromExercise(ex)],
    );
  }

  // Количество подходов = число карточек упражнения.
  function setCount(ex: ExerciseResponse, n: number) {
    if (n < 1) return;
    setPositions((prev) => {
      const mine = prev.filter((p) => p.exerciseId === ex.id);
      if (n === mine.length) return prev;
      if (n < mine.length) {
        const dropIds = new Set(mine.slice(n).map((p) => p.id));
        return prev.filter((p) => !dropIds.has(p.id));
      }
      const additions = Array.from({ length: n - mine.length }, () => draftFromExercise(ex));
      const lastIdx = prev.map((p) => p.exerciseId).lastIndexOf(ex.id);
      return [...prev.slice(0, lastIdx + 1), ...additions, ...prev.slice(lastIdx + 1)];
    });
  }

  function updatePosition(rowId: string, patch: Partial<Draft>) {
    setPositions((prev) => prev.map((p) => (p.id === rowId ? { ...p, ...patch } : p)));
  }

  function removePosition(rowId: string) {
    setPositions((prev) => prev.filter((p) => p.id !== rowId));
  }

  function buildPayload(): CreateTemplateRequest {
    const exercises: TemplateExercise[] = positions.map((p) => ({
      exerciseId: p.exerciseId,
      sets: 1,
      reps: p.timeBased ? null : parseOptNum(p.reps),
      weightKg: p.timeBased ? null : parseOptNum(p.weightKg),
      timeSec: p.timeBased ? parseOptNum(p.timeSec) : null,
      restSec: parseOptNum(p.restSec) ?? 90,
    }));
    const tag = categoryTag?.trim();
    return {
      name: name.trim(),
      shortDescription: shortDescription.trim() === '' ? null : shortDescription.trim(),
      categoryTag: tag ? tag : null,
      exercises,
    };
  }

  function save() {
    if (name.trim() === '' || positions.length === 0) return;
    const payload = buildPayload();
    mutation.mutate(payload, {
      onSuccess: () => {
        void navigate('/knowledge', { replace: true });
      },
    });
  }

  function handleDelete() {
    if (!window.confirm('Удалить шаблон? Действие необратимо.')) return;
    deleteMutation.mutate(id, {
      onSuccess: () => {
        void navigate('/knowledge', { replace: true });
      },
    });
  }

  // ───────────────────────── Шаг 1: выбор группы и упражнений ─────────────────────────
  if (step === 1) {
    const catalogEmpty = catalog.isSuccess && (catalog.data?.length ?? 0) === 0;
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader
          title="Сборка тренировки"
          closeIcon
          back="/knowledge"
          right={
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={positions.length === 0}
              className="px-1 text-[14px] font-semibold text-ink disabled:opacity-40"
            >
              Дальше
            </button>
          }
        />
        <div className="flex flex-1 flex-col gap-5 px-2 pb-8 pt-1">
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">шаг 1 из 2</p>

          {catalog.isPending && <p className="text-sm text-ink-muted">Загрузка каталога…</p>}
          {catalogEmpty && (
            <p className="text-sm text-ink-muted">Сначала добавьте упражнения в базу знаний.</p>
          )}

          {groups.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Группа мышц
              </h2>
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
            </section>
          )}

          {group && (
            <section className="flex flex-col gap-2">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Упражнения «{group}»
              </h2>
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input
                  type="search"
                  value={exerciseQuery}
                  onChange={(e) => setExerciseQuery(e.target.value)}
                  placeholder="Поиск упражнения"
                  aria-label="Поиск упражнения"
                  className="shelf w-full rounded-2xl py-2.5 pl-9 pr-9 text-sm text-ink outline-none placeholder:text-ink-muted"
                />
                {exerciseQuery !== '' && (
                  <button
                    type="button"
                    aria-label="Очистить"
                    onClick={() => setExerciseQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted active:text-ink"
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                )}
              </div>
              {visibleExercises.length === 0 && (
                <p className="px-1 py-2 text-sm text-ink-muted">Ничего не найдено.</p>
              )}
              <ul className="flex flex-col gap-2">
                {visibleExercises.map((ex) => {
                  const count = countByExercise.get(ex.id) ?? 0;
                  const picked = count > 0;
                  return (
                    <li
                      key={ex.id}
                      className="flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3"
                    >
                      <button
                        type="button"
                        onClick={() => toggleExercise(ex)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                            picked
                              ? 'bg-accent text-accent-on'
                              : 'border border-line bg-transparent'
                          }`}
                        >
                          {picked && <Check />}
                        </span>
                        <ExerciseThumb url={ex.thumbUrl ?? ex.imageUrl} alt={ex.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-ink">
                            {ex.name}
                          </span>
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
                      {picked && (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            aria-label="Меньше подходов"
                            onClick={() => setCount(ex, count - 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-ink active:scale-95"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="w-4 text-center font-mono text-[15px] font-bold tabular-nums text-ink">
                            {count}
                          </span>
                          <button
                            type="button"
                            aria-label="Больше подходов"
                            onClick={() => setCount(ex, count + 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-ink active:scale-95"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
                {visibleExercises.length === 0 && !catalog.isPending && (
                  <li className="rounded-2xl bg-card py-6 text-center text-sm text-ink-muted">
                    В этой группе пока нет упражнений
                  </li>
                )}
              </ul>
            </section>
          )}

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
                    <p className="mt-0.5 text-[13px] text-ink-muted">
                      {musclesFor(infoEx.category)}
                    </p>
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
      </div>
    );
  }

  // ───────────────────────── Шаг 2: детали и сохранение ─────────────────────────
  if (editing && existing.isPending) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Тренировка" back="/knowledge" />
        <p className="px-2 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title={editing ? 'Тренировка' : 'Сборка тренировки'}
        back={editing ? '/knowledge' : () => setStep(1)}
        left={
          editing ? undefined : (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-0.5 px-1 text-[14px] font-semibold text-ink active:opacity-60"
            >
              <ChevronLeft size={18} strokeWidth={2} />
              Назад
            </button>
          )
        }
        right={
          <button
            type="button"
            onClick={save}
            disabled={mutation.isPending || name.trim() === '' || positions.length === 0}
            className="px-1 text-[14px] font-semibold text-ink disabled:opacity-40"
          >
            {mutation.isPending ? '…' : editing ? 'Сохранить' : 'Готово'}
          </button>
        }
      />
      <div className="flex flex-1 flex-col gap-5 px-2 pb-8 pt-1">
        {!editing && (
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">шаг 2 из 2</p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Название
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Верх · Сила"
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-[15px] text-ink outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Краткое описание
          </span>
          <textarea
            rows={2}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            placeholder="Силовая на верх — грудь, спина, плечи…"
            className="w-full resize-none rounded-xl border border-line bg-card px-4 py-3 text-[15px] text-ink outline-none focus:border-accent"
          />
        </label>

        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Тип
          </h2>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_TAGS.map((t) => {
              const active = t === categoryTag;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCategoryTag(active ? null : t)}
                  className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                    active ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Упражнения
            </h2>
            <span className="font-mono text-[11px] text-ink-muted">{positions.length}</span>
          </div>

          {positions.length === 0 && (
            <p className="text-sm text-ink-muted">Вернитесь на шаг 1 и выберите упражнения.</p>
          )}

          <SortableList
            items={positions}
            onReorder={setPositions}
            renderItem={(p) => (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{p.name}</div>
                    {p.category && (
                      <div className="truncate font-mono text-[11px] text-ink-muted">
                        {p.category}
                      </div>
                    )}
                  </div>
                  <HoldToDelete
                    onDelete={() => removePosition(p.id)}
                    label="Удерживайте, чтобы убрать упражнение"
                  />
                </div>

                <div className={`grid gap-2 ${p.timeBased ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {p.timeBased ? (
                    <SetField
                      label="Сек"
                      value={p.timeSec}
                      onChange={(v) => updatePosition(p.id, { timeSec: v })}
                    />
                  ) : (
                    <>
                      <SetField
                        label="Повт."
                        value={p.reps}
                        onChange={(v) => updatePosition(p.id, { reps: v })}
                      />
                      <SetField
                        label="Кг"
                        value={p.weightKg}
                        onChange={(v) => updatePosition(p.id, { weightKg: v })}
                        step="0.5"
                      />
                    </>
                  )}
                  <SetField
                    label="Отдых"
                    value={p.restSec}
                    onChange={(v) => updatePosition(p.id, { restSec: v })}
                  />
                </div>

                {(() => {
                  const ex = exById.get(p.exerciseId);
                  if (!ex) return null;
                  const hasExtra = Boolean(
                    ex.videoUrl ||
                    ex.imageUrl ||
                    ex.equipment ||
                    ex.primaryMuscles ||
                    ex.secondaryMuscles ||
                    ex.description,
                  );
                  if (!hasExtra) return null;
                  const open = expanded[p.id] ?? false;
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => setExpanded((s) => ({ ...s, [p.id]: !open }))}
                        className="flex items-center gap-1 self-start text-[12px] font-medium text-ink-muted"
                      >
                        {open ? 'Скрыть' : 'Показать больше'}
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${open ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {open && <ExerciseDetails exercise={ex} />}
                    </>
                  );
                })()}
              </div>
            )}
          />
        </section>

        {mutation.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось сохранить. Проверьте поля и попробуйте снова.
          </p>
        )}

        {editing && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            Удалить шаблон
          </Button>
        )}
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SetField({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full rounded-lg border border-line bg-chip px-2 py-2 text-center font-mono text-sm text-ink outline-none focus:border-accent"
        {...rest}
      />
    </label>
  );
}
