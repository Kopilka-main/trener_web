import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

  function exerciseName(exerciseId: string): string {
    return catalog.data?.find((e) => e.id === exerciseId)?.name ?? 'Упражнение';
  }

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

  if (mode === 'edit' && existing.isPending) {
    return <p className="px-5 py-6 text-sm text-slate-500">Загрузка…</p>;
  }

  const title = mode === 'create' ? 'Новый шаблон' : 'Редактирование шаблона';
  const catalogEmpty = catalog.isSuccess && (catalog.data?.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Название"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Field
          label="Тег категории"
          name="categoryTag"
          value={categoryTag}
          onChange={(e) => setCategoryTag(e.target.value)}
        />

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-medium text-slate-700">Упражнения</h2>

          {catalog.isPending && <p className="text-sm text-slate-500">Загрузка каталога…</p>}
          {catalogEmpty && (
            <p className="text-sm text-slate-500">Сначала добавьте упражнения в базу знаний.</p>
          )}
          {positions.length === 0 && !catalogEmpty && (
            <p className="text-sm text-slate-500">Добавьте хотя бы одно упражнение.</p>
          )}

          <ul className="flex flex-col gap-3">
            {positions.map((p, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-2xl bg-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-500">
                    {index + 1}. {exerciseName(p.exerciseId)}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Вверх"
                      onClick={() => movePosition(index, -1)}
                      disabled={index === 0}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Вниз"
                      onClick={() => movePosition(index, 1)}
                      disabled={index === positions.length - 1}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600 disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="Удалить позицию"
                      onClick={() => removePosition(index)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Упражнение</span>
                  <select
                    value={p.exerciseId}
                    onChange={(e) => updatePosition(index, { exerciseId: e.target.value })}
                    aria-label={`Упражнение позиции ${String(index + 1)}`}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-slate-500"
                  >
                    {(catalog.data ?? []).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Подходы</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={p.sets}
                      onChange={(e) => updatePosition(index, { sets: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Повторы</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={p.reps}
                      onChange={(e) => updatePosition(index, { reps: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Вес, кг</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.5"
                      value={p.weightKg}
                      onChange={(e) => updatePosition(index, { weightKg: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Время, сек</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={p.timeSec}
                      onChange={(e) => updatePosition(index, { timeSec: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Отдых, сек</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={3600}
                      value={p.restSec}
                      onChange={(e) => updatePosition(index, { restSec: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="secondary"
            onClick={addPosition}
            disabled={catalog.data === undefined || catalogEmpty}
          >
            + Добавить упражнение
          </Button>
        </section>

        {mutation.isError && (
          <p className="text-sm text-slate-500" role="alert">
            Не удалось сохранить. Проверьте поля и попробуйте снова.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={mutation.isPending || positions.length === 0}>
            {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          {mode === 'edit' && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              Удалить
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => void navigate(-1)}>
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}
