import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CreateExerciseRequest } from '@trener/shared';
import {
  useExercise,
  useCreateExercise,
  useUpdateExercise,
  useDeleteExercise,
} from '../api/exercises';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { Stepper } from '../components/Stepper';
import { ExerciseDetails } from '../components/ExerciseDetails';
import { subgroupsFor } from '../lib/muscleGroups';

interface ExerciseEditPageProps {
  mode: 'create' | 'edit';
}

/** Группы мышц для выбора категории упражнения. */
const GROUP_ORDER = ['Грудь', 'Спина', 'Ноги', 'Плечи', 'Руки', 'Пресс/Кор', 'Кардио', 'Растяжка'];

/** Положительное число или null (0/пусто = не задано). */
function positiveOrNull(value: number): number | null {
  return value > 0 ? value : null;
}

export function ExerciseEditPage({ mode }: ExerciseEditPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const editing = mode === 'edit';

  const existing = useExercise(editing ? id : '');
  const createMutation = useCreateExercise();
  const updateMutation = useUpdateExercise(id);
  const deleteMutation = useDeleteExercise();

  // Глобальные упражнения из каталога нельзя править на месте — при сохранении
  // создаётся личная копия (createMutation вместо update).
  const isGlobalEdit = editing && existing.data?.isGlobal === true;
  const mutation = editing && !isGlobalEdit ? updateMutation : createMutation;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Грудь');
  const [subgroup, setSubgroup] = useState('');
  const [description, setDescription] = useState('');
  const [defaultReps, setDefaultReps] = useState(10);
  const [defaultWeightKg, setDefaultWeightKg] = useState(0);
  const [defaultTimeSec, setDefaultTimeSec] = useState(0);
  const [restSec, setRestSec] = useState(90);

  useEffect(() => {
    if (editing && existing.data) {
      const e = existing.data;
      setName(e.name);
      setCategory(e.category);
      setSubgroup(e.subgroup ?? '');
      setDescription(e.description ?? '');
      setDefaultReps(e.defaultReps ?? 0);
      setDefaultWeightKg(e.defaultWeightKg ?? 0);
      setDefaultTimeSec(e.defaultTimeSec ?? 0);
      setRestSec(e.restSec);
    }
  }, [editing, existing.data]);

  // Медиа упражнения (картинка/видео техники) — есть у записей каталога.
  const media = editing ? existing.data : undefined;

  // Категория может прийти кастомная (не из списка) — покажем её тоже.
  const categoryChips = GROUP_ORDER.includes(category) ? GROUP_ORDER : [category, ...GROUP_ORDER];
  const subgroupOptions = subgroupsFor(category.trim());

  function selectCategory(next: string) {
    setCategory(next);
    if (subgroup !== '' && !subgroupsFor(next.trim()).includes(subgroup)) setSubgroup('');
  }

  function save() {
    if (name.trim() === '') return;
    const payload: CreateExerciseRequest = {
      name: name.trim(),
      category: category.trim(),
      subgroup: subgroup.trim() === '' ? null : subgroup.trim(),
      description: description.trim() === '' ? null : description.trim(),
      defaultReps: positiveOrNull(defaultReps),
      defaultWeightKg: positiveOrNull(defaultWeightKg),
      defaultTimeSec: positiveOrNull(defaultTimeSec),
      restSec,
      // Вариант базового упражнения → переносим фото/видео/мышцы из каталога.
      ...(isGlobalEdit ? { sourceExerciseId: id } : {}),
    };
    mutation.mutate(payload, {
      onSuccess: () => {
        void navigate('/knowledge', { replace: true });
      },
    });
  }

  function handleDelete() {
    if (!window.confirm('Удалить упражнение? Действие необратимо.')) return;
    deleteMutation.mutate(id, {
      onSuccess: () => {
        void navigate('/knowledge', { replace: true });
      },
    });
  }

  if (editing && existing.isPending) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title="Упражнение" back="/knowledge" />
        <p className="px-2 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title={editing ? 'Упражнение' : 'Новое упражнение'}
        closeIcon={!editing}
        back="/knowledge"
        right={
          <button
            type="button"
            onClick={save}
            disabled={mutation.isPending || name.trim() === ''}
            className="px-1 text-[14px] font-semibold text-ink disabled:opacity-40"
          >
            {mutation.isPending ? '…' : 'Сохранить'}
          </button>
        }
      />
      <div className="flex flex-1 flex-col gap-5 px-2 pb-8 pt-1">
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Группа мышц
          </h2>
          <div className="flex flex-wrap gap-2">
            {categoryChips.map((c) => (
              <button
                key={c}
                type="button"
                disabled={isGlobalEdit}
                onClick={() => selectCategory(c)}
                className={`rounded-full px-4 py-2 text-[14px] font-semibold transition-colors disabled:cursor-default ${
                  c === category ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        {subgroupOptions.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Подгруппа
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isGlobalEdit}
                onClick={() => setSubgroup('')}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors disabled:cursor-default ${
                  subgroup === '' ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                }`}
              >
                Не указано
              </button>
              {subgroupOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={isGlobalEdit}
                  onClick={() => setSubgroup(s)}
                  className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors disabled:cursor-default ${
                    subgroup === s ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Название
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            readOnly={isGlobalEdit}
            placeholder="Жим ногами под углом 45°"
            className={`w-full rounded-xl border border-line bg-card px-4 py-3 text-[15px] outline-none focus:border-accent ${
              isGlobalEdit ? 'cursor-default text-ink-muted' : 'text-ink'
            }`}
          />
        </label>

        {media && <ExerciseDetails exercise={media} showDescription={false} />}

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Описание
          </span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            readOnly={isGlobalEdit}
            placeholder={isGlobalEdit ? 'Описание из каталога' : 'Техника, цель упражнения…'}
            className={`w-full resize-none rounded-xl border border-line bg-card px-4 py-3 text-[15px] outline-none focus:border-accent ${
              isGlobalEdit ? 'cursor-default text-ink-muted' : 'text-ink'
            }`}
          />
        </label>

        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Параметры подхода
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <Stepper value={defaultReps} onChange={setDefaultReps} label="повторы" unit="повт" />
            <Stepper
              value={defaultWeightKg}
              onChange={setDefaultWeightKg}
              step={2.5}
              label="вес"
              unit="кг"
            />
            <Stepper
              value={defaultTimeSec}
              onChange={setDefaultTimeSec}
              step={5}
              label="время"
              unit="сек"
            />
            <Stepper value={restSec} onChange={setRestSec} step={15} label="отдых" unit="сек" />
          </div>
        </section>

        {isGlobalEdit && (
          <p className="text-xs text-ink-muted">
            Системное упражнение из каталога: название, группа и описание изменить нельзя — можно
            настроить только параметры подхода. Сохранится как ваша копия.
          </p>
        )}

        {mutation.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось сохранить. Проверьте поля и попробуйте снова.
          </p>
        )}

        {editing && !isGlobalEdit && (
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
    </div>
  );
}
