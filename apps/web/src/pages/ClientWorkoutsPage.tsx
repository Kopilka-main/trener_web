import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Dumbbell, Plus, X } from 'lucide-react';
import type { TemplateResponse, WorkoutResponse, WorkoutStatus } from '@trener/shared';
import { useClientWorkouts, useCreateWorkout } from '../api/client-workouts';
import { useTemplates } from '../api/workout-templates';
import { ScreenHeader } from '../components/ScreenHeader';

const STATUS_LABEL: Record<WorkoutStatus, string> = {
  draft: 'Черновик',
  active: 'Идёт',
  completed: 'Завершена',
  skipped: 'Пропущена',
};

function isCurrent(w: WorkoutResponse): boolean {
  return w.status === 'active' || w.status === 'draft';
}

function workoutDateMs(w: WorkoutResponse): number {
  const raw = w.completedAt ?? w.startedAt;
  return raw ? Date.parse(raw) : 0;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function ClientWorkoutsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workouts = useClientWorkouts(id);
  const createWorkout = useCreateWorkout(id);
  const [picking, setPicking] = useState(false);

  const list = workouts.data ?? [];
  const current = useMemo(
    () =>
      list
        .filter(isCurrent)
        .sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1)),
    [list],
  );
  const history = useMemo(
    () => list.filter((w) => !isCurrent(w)).sort((a, b) => workoutDateMs(b) - workoutDateMs(a)),
    [list],
  );

  function assignTemplate(template: TemplateResponse) {
    const body = {
      name: template.name,
      sourceTemplateId: template.id,
      exercises: template.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        sets: Array.from({ length: Math.max(1, ex.sets) }, () => ({
          plannedReps: ex.reps,
          plannedWeightKg: ex.weightKg,
          plannedTimeSec: ex.timeSec,
          plannedRestSec: ex.restSec,
        })),
      })),
    };
    createWorkout.mutate(body, {
      onSuccess: (workout) => {
        setPicking(false);
        void navigate(`/clients/${id}/workouts/${workout.id}`);
      },
    });
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Тренировки" back={`/clients/${id}`} />

      <div className="flex flex-1 flex-col gap-6 px-5 pb-28 pt-2">
        {workouts.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {workouts.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось загрузить тренировки. Попробуйте обновить страницу.
          </p>
        )}

        {workouts.isSuccess && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center">
            <Dumbbell size={28} strokeWidth={1.6} className="text-ink-muted" />
            <p className="text-sm text-ink-muted">
              Пока нет тренировок. Назначьте первую по шаблону.
            </p>
          </div>
        )}

        {current.length > 0 && (
          <Section title="Текущие">
            {current.map((w) => (
              <WorkoutRow key={w.id} clientId={id} workout={w} />
            ))}
          </Section>
        )}

        {history.length > 0 && (
          <Section title="История">
            {history.map((w) => (
              <WorkoutRow key={w.id} clientId={id} workout={w} />
            ))}
          </Section>
        )}
      </div>

      <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex justify-end px-5">
        <button
          type="button"
          onClick={() => setPicking(true)}
          aria-label="Назначить тренировку"
          className="tile-shadow-primary pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full active:scale-[0.95]"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>
      </div>

      {picking && (
        <TemplatePickerSheet
          onClose={() => setPicking(false)}
          onPick={assignTemplate}
          pending={createWorkout.isPending}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function WorkoutRow({ clientId, workout }: { clientId: string; workout: WorkoutResponse }) {
  const date = formatDate(workout.completedAt ?? workout.startedAt);
  return (
    <li>
      <Link
        to={`/clients/${clientId}/workouts/${workout.id}`}
        className="row-glow flex items-center gap-3 rounded-2xl bg-card px-4 py-3 transition-colors active:bg-card-elevated"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold text-ink">{workout.name}</span>
          <span className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
            <span className="rounded-full bg-chip px-2 py-0.5 uppercase tracking-[0.04em]">
              {STATUS_LABEL[workout.status]}
            </span>
            <span>{workout.exercises.length} упр.</span>
            {date && <span>· {date}</span>}
          </span>
        </span>
        <ChevronRight size={16} className="tile-chevron shrink-0" />
      </Link>
    </li>
  );
}

function TemplatePickerSheet({
  onClose,
  onPick,
  pending,
}: {
  onClose: () => void;
  onPick: (template: TemplateResponse) => void;
  pending: boolean;
}) {
  const templates = useTemplates();
  const list = templates.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 flex max-h-[75vh] flex-col rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-bold text-ink">Выберите шаблон</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto px-5 pt-1">
          {templates.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}
          {templates.isError && (
            <p className="text-sm text-ink-muted" role="alert">
              Не удалось загрузить шаблоны.
            </p>
          )}
          {templates.isSuccess && list.length === 0 && (
            <p className="text-sm text-ink-muted">Нет шаблонов. Создайте шаблон в Базе знаний.</p>
          )}
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={pending}
              onClick={() => onPick(t)}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left transition-colors active:bg-card-elevated disabled:opacity-50"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold text-ink">{t.name}</span>
                <span className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                  {t.exercises.length} упр.
                  {t.categoryTag ? ` · ${t.categoryTag}` : ''}
                </span>
              </span>
              <ChevronRight size={16} className="tile-chevron shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
