import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, X } from 'lucide-react';
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

/** Позиция в сборке: значения подходов — строками для удобного ввода. */
interface Draft {
  exerciseId: string;
  name: string;
  category: string;
  sets: string;
  reps: string;
  weightKg: string;
  timeSec: string;
  restSec: string;
}

function parseOptNum(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function draftFromExercise(ex: ExerciseResponse): Draft {
  return {
    exerciseId: ex.id,
    name: ex.name,
    category: ex.category,
    sets: '1',
    reps: ex.defaultReps?.toString() ?? '',
    weightKg: ex.defaultWeightKg?.toString() ?? '',
    timeSec: ex.defaultTimeSec?.toString() ?? '',
    restSec: ex.restSec.toString(),
  };
}

export function TemplateEditPage({ mode }: TemplateEditPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const editing = mode === 'edit';

  const catalog = useExercises();
  const existing = useTemplate(editing ? id : '');
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate(id);
  const deleteMutation = useDeleteTemplate();
  const mutation = editing ? updateMutation : createMutation;

  const [step, setStep] = useState<1 | 2>(editing ? 2 : 1);
  const [name, setName] = useState('');
  const [categoryTag, setCategoryTag] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [positions, setPositions] = useState<Draft[]>([]);

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

  // Загрузка существующего шаблона в режиме редактирования.
  useEffect(() => {
    if (editing && existing.data) {
      const t = existing.data;
      setName(t.name);
      setCategoryTag(t.categoryTag);
      setPositions(
        t.exercises.map((p) => ({
          exerciseId: p.exerciseId,
          name: p.exerciseName,
          category: catalog.data?.find((e) => e.id === p.exerciseId)?.category ?? '',
          sets: p.sets.toString(),
          reps: p.reps?.toString() ?? '',
          weightKg: p.weightKg?.toString() ?? '',
          timeSec: p.timeSec?.toString() ?? '',
          restSec: p.restSec.toString(),
        })),
      );
    }
  }, [editing, existing.data, catalog.data]);

  const pickedIds = useMemo(() => new Set(positions.map((p) => p.exerciseId)), [positions]);
  const groupExercises = useMemo(
    () => (catalog.data ?? []).filter((e) => e.category === group),
    [catalog.data, group],
  );

  function toggleExercise(ex: ExerciseResponse) {
    setPositions((prev) =>
      pickedIds.has(ex.id)
        ? prev.filter((p) => p.exerciseId !== ex.id)
        : [...prev, draftFromExercise(ex)],
    );
  }

  function setSets(exerciseId: string, next: number) {
    if (next < 1) return;
    setPositions((prev) =>
      prev.map((p) => (p.exerciseId === exerciseId ? { ...p, sets: String(next) } : p)),
    );
  }

  function updatePosition(index: number, patch: Partial<Draft>) {
    setPositions((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePosition(index: number) {
    setPositions((prev) => prev.filter((_, i) => i !== index));
  }

  function movePosition(index: number, dir: -1 | 1) {
    setPositions((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const item = next[index];
      if (item === undefined) return prev;
      next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  function buildPayload(): CreateTemplateRequest {
    const exercises: TemplateExercise[] = positions.map((p) => ({
      exerciseId: p.exerciseId,
      sets: parseOptNum(p.sets) ?? 1,
      reps: parseOptNum(p.reps),
      weightKg: parseOptNum(p.weightKg),
      timeSec: parseOptNum(p.timeSec),
      restSec: parseOptNum(p.restSec) ?? 90,
    }));
    const tag = categoryTag?.trim();
    return {
      name: name.trim(),
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
        <div className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-1">
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
                      onClick={() => setGroup(g)}
                      className={`rounded-full px-4 py-2 text-[14px] font-semibold transition-colors ${
                        active ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {group && (
            <section className="flex flex-col gap-2">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Упражнения «{group}»
              </h2>
              <ul className="flex flex-col gap-2">
                {groupExercises.map((ex) => {
                  const picked = pickedIds.has(ex.id);
                  const count = Number(positions.find((p) => p.exerciseId === ex.id)?.sets ?? '0');
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
                            picked ? 'bg-accent text-accent-on' : 'bg-chip text-transparent'
                          }`}
                        >
                          <Check picked={picked} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-ink">
                            {ex.name}
                          </span>
                          {(ex.description ?? ex.category) && (
                            <span className="block truncate text-[12px] text-ink-muted">
                              {ex.description ?? ex.category}
                            </span>
                          )}
                        </span>
                      </button>
                      {picked && (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            aria-label="Меньше подходов"
                            onClick={() => setSets(ex.id, count - 1)}
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
                            onClick={() => setSets(ex.id, count + 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-ink active:scale-95"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
                {groupExercises.length === 0 && !catalog.isPending && (
                  <li className="rounded-2xl bg-card py-6 text-center text-sm text-ink-muted">
                    В этой группе пока нет упражнений
                  </li>
                )}
              </ul>
            </section>
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
        <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title={editing ? 'Тренировка' : 'Сборка тренировки'}
        back={editing ? '/knowledge' : () => setStep(1)}
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
      <div className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-1">
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

          <ul className="flex flex-col gap-3">
            {positions.map((p, index) => (
              <li
                key={`${p.exerciseId}-${String(index)}`}
                className="shelf flex flex-col gap-3 rounded-2xl p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-chip font-mono text-xs font-bold text-ink">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{p.name}</div>
                    {p.category && (
                      <div className="truncate font-mono text-[11px] text-ink-muted">
                        {p.category}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="Вверх"
                      onClick={() => movePosition(index, -1)}
                      disabled={index === 0}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-card-elevated text-ink-muted disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Вниз"
                      onClick={() => movePosition(index, 1)}
                      disabled={index === positions.length - 1}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-card-elevated text-ink-muted disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="Убрать упражнение"
                      onClick={() => removePosition(index)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-card-elevated text-ink-muted"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <SetField
                    label="Подх."
                    value={p.sets}
                    onChange={(v) => updatePosition(index, { sets: v })}
                  />
                  <SetField
                    label="Повт."
                    value={p.reps}
                    onChange={(v) => updatePosition(index, { reps: v })}
                  />
                  <SetField
                    label="Кг"
                    value={p.weightKg}
                    onChange={(v) => updatePosition(index, { weightKg: v })}
                    step="0.5"
                  />
                  <SetField
                    label="Сек"
                    value={p.timeSec}
                    onChange={(v) => updatePosition(index, { timeSec: v })}
                  />
                  <SetField
                    label="Отдых"
                    value={p.restSec}
                    onChange={(v) => updatePosition(index, { restSec: v })}
                  />
                </div>
              </li>
            ))}
          </ul>
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

function Check({ picked }: { picked: boolean }) {
  if (!picked) return null;
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
