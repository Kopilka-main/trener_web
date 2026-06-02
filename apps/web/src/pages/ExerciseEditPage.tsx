import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { CreateExerciseRequest } from '@trener/shared';
import {
  useExercise,
  useCreateExercise,
  useUpdateExercise,
  useDeleteExercise,
} from '../api/exercises';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { ScreenHeader } from '../components/ScreenHeader';
import { subgroupsFor } from '../lib/muscleGroups';

interface ExerciseEditPageProps {
  mode: 'create' | 'edit';
}

/** Парсит число из строки поля; пустая строка → null (поле не задано). */
function parseOptNum(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function ExerciseEditPage({ mode }: ExerciseEditPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';

  const existing = useExercise(mode === 'edit' ? id : '');
  const createMutation = useCreateExercise();
  const updateMutation = useUpdateExercise(id);
  const deleteMutation = useDeleteExercise();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [subgroup, setSubgroup] = useState('');
  const [description, setDescription] = useState('');
  const [defaultReps, setDefaultReps] = useState('');
  const [defaultWeightKg, setDefaultWeightKg] = useState('');
  const [defaultTimeSec, setDefaultTimeSec] = useState('');
  const [restSec, setRestSec] = useState('90');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (mode === 'edit' && existing.data) {
      const e = existing.data;
      setName(e.name);
      setCategory(e.category);
      setSubgroup(e.subgroup ?? '');
      setDescription(e.description ?? '');
      setDefaultReps(e.defaultReps?.toString() ?? '');
      setDefaultWeightKg(e.defaultWeightKg?.toString() ?? '');
      setDefaultTimeSec(e.defaultTimeSec?.toString() ?? '');
      setRestSec(e.restSec.toString());
      setNote(e.note ?? '');
    }
  }, [mode, existing.data]);

  const mutation = mode === 'create' ? createMutation : updateMutation;

  // При смене категории сбрасываем подгруппу, если она не входит в новый список.
  function handleCategoryChange(next: string) {
    setCategory(next);
    if (subgroup !== '' && !subgroupsFor(next.trim()).includes(subgroup)) {
      setSubgroup('');
    }
  }

  const subgroupOptions = subgroupsFor(category.trim());

  function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const payload: CreateExerciseRequest = {
      name: name.trim(),
      category: category.trim(),
      subgroup: subgroup.trim() === '' ? null : subgroup.trim(),
      description: description.trim() === '' ? null : description.trim(),
      defaultReps: parseOptNum(defaultReps),
      defaultWeightKg: parseOptNum(defaultWeightKg),
      defaultTimeSec: parseOptNum(defaultTimeSec),
      restSec: parseOptNum(restSec) ?? 90,
      note: note.trim() === '' ? null : note.trim(),
    };
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
    if (!window.confirm('Удалить упражнение? Действие необратимо.')) return;
    deleteMutation.mutate(id, {
      onSuccess: () => {
        void navigate('/knowledge', { replace: true });
      },
    });
  }

  if (mode === 'edit' && existing.isPending) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Упражнение" back="/knowledge" />
        <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  // Глобальные упражнения read-only: редактирование запрещено.
  if (mode === 'edit' && existing.data?.isGlobal) {
    return <Navigate to="/knowledge" replace />;
  }

  const title = mode === 'create' ? 'Новое упражнение' : 'Упражнение';

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
          name="category"
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          required
        />
        {subgroupOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Подгруппа</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSubgroup('')}
                className={`rounded-full px-4 py-2 text-[14px] font-semibold transition-colors ${
                  subgroup === '' ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                }`}
              >
                Не указано
              </button>
              {subgroupOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSubgroup(s)}
                  className={`rounded-full px-4 py-2 text-[14px] font-semibold transition-colors ${
                    subgroup === s ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <label htmlFor="description" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Описание</span>
          <textarea
            id="description"
            name="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
          />
        </label>
        <Field
          label="Повторы по умолчанию"
          name="defaultReps"
          type="number"
          inputMode="numeric"
          min={1}
          value={defaultReps}
          onChange={(e) => setDefaultReps(e.target.value)}
        />
        <Field
          label="Вес по умолчанию, кг"
          name="defaultWeightKg"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.5"
          value={defaultWeightKg}
          onChange={(e) => setDefaultWeightKg(e.target.value)}
        />
        <Field
          label="Время по умолчанию, сек"
          name="defaultTimeSec"
          type="number"
          inputMode="numeric"
          min={1}
          value={defaultTimeSec}
          onChange={(e) => setDefaultTimeSec(e.target.value)}
        />
        <Field
          label="Отдых, сек"
          name="restSec"
          type="number"
          inputMode="numeric"
          min={0}
          max={3600}
          value={restSec}
          onChange={(e) => setRestSec(e.target.value)}
        />
        <label htmlFor="note" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Заметка</span>
          <textarea
            id="note"
            name="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
          />
        </label>

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
            Удалить упражнение
          </Button>
        )}
      </div>

      <div className="sticky bottom-0 z-10 mt-auto flex flex-col gap-2 bg-gradient-to-t from-bg via-bg to-transparent px-5 pb-4 pt-4">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void navigate(-1)}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
