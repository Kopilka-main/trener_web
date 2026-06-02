import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { CreateTemplateRequest, TemplateExercise } from '@trener/shared';
import { useExercises } from '../api/exercises';
import {
  useTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from '../api/workout-templates';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { ScreenHeader } from '../components/ScreenHeader';

interface TemplateEditPageProps {
  mode: 'create' | 'edit';
}

/** Позиция шаблона в форме: значения подходов хранятся строками для удобного ввода. */
interface PositionDraft {
  exerciseId: string;
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

function emptyPosition(exerciseId: string): PositionDraft {
  return { exerciseId, sets: '3', reps: '', weightKg: '', timeSec: '', restSec: '90' };
}

export function TemplateEditPage({ mode }: TemplateEditPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';

  const catalog = useExercises();
  const existing = useTemplate(mode === 'edit' ? id : '');
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate(id);
  const deleteMutation = useDeleteTemplate();

  const [name, setName] = useState('');
  const [categoryTag, setCategoryTag] = useState('');
  const [positions, setPositions] = useState<PositionDraft[]>([]);

  useEffect(() => {
    if (mode === 'edit' && existing.data) {
      const t = existing.data;
      setName(t.name);
      setCategoryTag(t.categoryTag ?? '');
      setPositions(
        t.exercises.map((p) => ({
          exerciseId: p.exerciseId,
          sets: p.sets.toString(),
          reps: p.reps?.toString() ?? '',
          weightKg: p.weightKg?.toString() ?? '',
          timeSec: p.timeSec?.toString() ?? '',
          restSec: p.restSec.toString(),
        })),
      );
    }
  }, [mode, existing.data]);

  const mutation = mode === 'create' ? createMutation : updateMutation;

  function addPosition() {
    const first = catalog.data?.[0];
    if (!first) return;
    setPositions((prev) => [...prev, emptyPosition(first.id)]);
  }

  function updatePosition(index: number, patch: Partial<PositionDraft>) {
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
    return {
      name: name.trim(),
      categoryTag: categoryTag.trim() === '' ? null : categoryTag.trim(),
      exercises,
    };
  }

  function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (positions.length === 0) return;
    const payload = buildPayload();
    if (mode === 'create') {
      createMutation.mutate(payload, {
        onSuccess: () => {
          void navigate('/knowledge', { replace: true });
        },
      });
    } else {
      updateMutation.mutate(payload, {
        onSuccess: () => {
          void navigate('/knowledge', { replace: true });
        },
      });
    }
  }

  function handleDelete() {
    if (!window.confirm('Удалить шаблон? Действие необратимо.')) return;
    deleteMutation.mutate(id, {
      onSuccess: () => {
        void navigate('/knowledge', { replace: true });
      },
    });
  }

  const title = mode === 'create' ? 'Новый шаблон' : 'Шаблон';
  const catalogEmpty = catalog.isSuccess && (catalog.data?.length ?? 0) === 0;

  if (mode === 'edit' && existing.isPending) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title={title} back="/knowledge" />
        <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-full flex-col">
      <ScreenHeader title={title} back="/knowledge" />
      <div className="flex flex-col gap-4 px-5 pb-6 pt-2">
        <Field
          label="Название"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Field
          label="Категория"
          name="categoryTag"
          value={categoryTag}
          onChange={(e) => setCategoryTag(e.target.value)}
        />

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-sm uppercase tracking-wide text-ink-muted">
              Упражнения
            </h2>
            {positions.length > 0 && (
              <span className="font-mono text-xs text-ink-muted">{positions.length}</span>
            )}
          </div>

          {catalog.isPending && <p className="text-sm text-ink-muted">Загрузка каталога…</p>}
          {catalogEmpty && (
            <p className="text-sm text-ink-muted">Сначала добавьте упражнения в базу знаний.</p>
          )}
          {positions.length === 0 && !catalogEmpty && (
            <p className="text-sm text-ink-muted">Добавьте хотя бы одно упражнение.</p>
          )}

          <ul className="flex flex-col gap-3">
            {positions.map((p, index) => (
              <li key={index} className="shelf flex flex-col gap-3 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-chip font-mono text-xs font-bold text-ink">
                    {index + 1}
                  </span>
                  <select
                    value={p.exerciseId}
                    onChange={(e) => updatePosition(index, { exerciseId: e.target.value })}
                    aria-label={`Упражнение позиции ${String(index + 1)}`}
                    className="min-w-0 flex-1 truncate rounded-lg border border-line bg-chip px-2 py-2 text-sm font-semibold text-ink outline-none focus:border-accent"
                  >
                    {(catalog.data ?? []).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="Вверх"
                      onClick={() => movePosition(index, -1)}
                      disabled={index === 0}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-card-elevated text-ink-muted disabled:opacity-40"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="Вниз"
                      onClick={() => movePosition(index, 1)}
                      disabled={index === positions.length - 1}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-card-elevated text-ink-muted disabled:opacity-40"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="Удалить позицию"
                      onClick={() => removePosition(index)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-card-elevated text-danger"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <SetField
                    label="Подх."
                    inputMode="numeric"
                    min={1}
                    value={p.sets}
                    onChange={(v) => updatePosition(index, { sets: v })}
                  />
                  <SetField
                    label="Повт."
                    inputMode="numeric"
                    min={1}
                    value={p.reps}
                    onChange={(v) => updatePosition(index, { reps: v })}
                  />
                  <SetField
                    label="Кг"
                    inputMode="decimal"
                    min={0}
                    step="0.5"
                    value={p.weightKg}
                    onChange={(v) => updatePosition(index, { weightKg: v })}
                  />
                  <SetField
                    label="Сек"
                    inputMode="numeric"
                    min={1}
                    value={p.timeSec}
                    onChange={(v) => updatePosition(index, { timeSec: v })}
                  />
                  <SetField
                    label="Отдых"
                    inputMode="numeric"
                    min={0}
                    max={3600}
                    value={p.restSec}
                    onChange={(v) => updatePosition(index, { restSec: v })}
                  />
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={addPosition}
            disabled={catalog.data === undefined || catalogEmpty}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3.5 text-sm font-medium text-ink-muted transition-colors active:border-accent disabled:opacity-40"
          >
            <Plus size={16} /> Добавить упражнение
          </button>
        </section>

        {mutation.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось сохранить. Проверьте поля и попробуйте снова.
          </p>
        )}

        {mode === 'edit' && (
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

      <div className="sticky bottom-0 z-10 mt-auto flex flex-col gap-2 bg-gradient-to-t from-bg via-bg to-transparent px-5 pb-4 pt-4">
        <Button type="submit" disabled={mutation.isPending || positions.length === 0}>
          {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void navigate(-1)}>
          Отмена
        </Button>
      </div>
    </form>
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full rounded-lg border border-line bg-chip px-2 py-2 text-center font-mono text-sm text-ink outline-none focus:border-accent"
        {...rest}
      />
    </label>
  );
}
