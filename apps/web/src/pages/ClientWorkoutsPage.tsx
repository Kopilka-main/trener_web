import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, ChevronUp, Play, Plus, RotateCcw, X } from 'lucide-react';
import type {
  CreateWorkoutRequest,
  TemplateResponse,
  WorkoutExerciseResponse,
  WorkoutResponse,
  WorkoutSetResponse,
} from '@trener/shared';
import { useClientWorkouts, useCreateWorkout } from '../api/client-workouts';
import { useTemplates } from '../api/workout-templates';
import { useClient } from '../api/clients';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToConfirm } from '../components/HoldToConfirm';

function isCurrent(w: WorkoutResponse): boolean {
  return w.status === 'active' || w.status === 'draft';
}

function workoutDateMs(w: WorkoutResponse): number {
  const raw = w.completedAt ?? w.startedAt;
  return raw ? Date.parse(raw) : 0;
}

export function ClientWorkoutsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const client = useClient(id);
  const workouts = useClientWorkouts(id);
  const createWorkout = useCreateWorkout(id);
  const [picker, setPicker] = useState<'none' | 'template' | 'history'>('none');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Повторить прошлую тренировку: клонируем упражнения и подходы в новый черновик.
  function repeat(w: WorkoutResponse) {
    if (w.exercises.length === 0) return;
    const body: CreateWorkoutRequest = {
      name: w.name,
      exercises: w.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        sets: ex.sets.map((s) => ({
          plannedReps: s.plannedReps ?? s.actualReps,
          plannedWeightKg: s.plannedWeightKg ?? s.actualWeightKg,
          plannedTimeSec: s.plannedTimeSec ?? s.actualTimeSec,
          plannedRestSec: s.plannedRestSec,
        })),
      })),
    };
    createWorkout.mutate(body, {
      onSuccess: (workout) => {
        void navigate(`/clients/${id}/workouts/${workout.id}`);
      },
    });
  }

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
    // Плоская модель: каждый подход — отдельное упражнение с одним подходом
    // (sets:N в шаблоне разворачиваем в N отдельных записей).
    const body = {
      name: template.name,
      sourceTemplateId: template.id,
      exercises: template.exercises.flatMap((ex) =>
        Array.from({ length: Math.max(1, ex.sets) }, () => ({
          exerciseId: ex.exerciseId,
          sets: [
            {
              plannedReps: ex.reps,
              plannedWeightKg: ex.weightKg,
              plannedTimeSec: ex.timeSec,
              plannedRestSec: ex.restSec,
            },
          ],
        })),
      ),
    };
    createWorkout.mutate(body, {
      onSuccess: (workout) => {
        setPicker('none');
        void navigate(`/clients/${id}/workouts/${workout.id}`);
      },
    });
  }

  const currentWorkout = current[0] ?? null;

  // История, сгруппированная по дате (новые сверху).
  const historyGroups = useMemo(() => {
    const map = new Map<string, WorkoutResponse[]>();
    for (const w of history) {
      const iso = w.completedAt ?? w.startedAt;
      const key = iso ? iso.slice(0, 10) : 'unknown';
      const arr = map.get(key);
      if (arr) arr.push(w);
      else map.set(key, [w]);
    }
    return [...map.entries()];
  }, [history]);

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title={
          client.data
            ? `Тренировки · ${client.data.firstName} ${client.data.lastName}`
            : 'Тренировки'
        }
        back={`/clients/${id}`}
      />

      <div className="flex flex-1 flex-col gap-6 px-5 pb-28 pt-2">
        {workouts.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {workouts.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось загрузить тренировки. Попробуйте обновить страницу.
          </p>
        )}

        {workouts.isSuccess && (
          <section className="flex flex-col gap-2">
            <SectionTitle title="Ближайшая тренировка" />
            {currentWorkout ? (
              <CurrentCard clientId={id} workout={currentWorkout} />
            ) : (
              <EmptyCurrent
                onPickTemplate={() => setPicker('template')}
                onPickHistory={() => setPicker('history')}
                hasHistory={history.length > 0}
              />
            )}
          </section>
        )}

        {history.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionTitle title={`История тренировок · ${history.length}`} />
            {historyGroups.map(([dateKey, items]) => (
              <div key={dateKey} className="flex flex-col gap-2">
                <div className="px-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.04em] text-ink-mutedxl">
                  {formatGroupDate(dateKey)}
                </div>
                <ul className="flex flex-col gap-2">
                  {items.map((w) => (
                    <HistoryRow
                      key={w.id}
                      workout={w}
                      expanded={expandedId === w.id}
                      onToggle={() => setExpandedId(expandedId === w.id ? null : w.id)}
                      onRepeat={() => repeat(w)}
                      repeatPending={createWorkout.isPending}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>

      {picker === 'template' && (
        <TemplatePickerSheet
          onClose={() => setPicker('none')}
          onPick={assignTemplate}
          pending={createWorkout.isPending}
        />
      )}

      {picker === 'history' && (
        <HistoryPickerSheet
          history={history}
          onClose={() => setPicker('none')}
          onPick={(w) => repeat(w)}
          pending={createWorkout.isPending}
        />
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
      {title}
    </h2>
  );
}

/** Карточка ближайшей тренировки (черновик/активная). */
function CurrentCard({ clientId, workout }: { clientId: string; workout: WorkoutResponse }) {
  const active = workout.status === 'active';
  return (
    <Link
      to={`/clients/${clientId}/workouts/${workout.id}`}
      className="flex flex-col gap-3 rounded-3xl bg-card p-4 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-bold text-ink">{workout.name}</div>
          <div className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
            {workout.exercises.length} упр.{active ? ' · идёт' : ''}
          </div>
        </div>
      </div>
      <span className="flex items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-[15px] font-semibold text-accent-on">
        <Play size={16} fill="currentColor" /> {active ? 'Продолжить' : 'Начать тренировку'}
      </span>
    </Link>
  );
}

/** Пустое состояние ближайшей тренировки (как на макете). */
function EmptyCurrent({
  onPickTemplate,
  onPickHistory,
  hasHistory,
}: {
  onPickTemplate: () => void;
  onPickHistory: () => void;
  hasHistory: boolean;
}) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-line p-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-chip text-ink">
        <Plus size={20} />
      </div>
      <div className="mt-3 text-[15px] font-semibold text-ink">Тренировка не запланирована</div>
      <div className="mx-auto mt-1 max-w-[280px] text-[12px] text-ink-muted">
        Выберите готовую из базы знаний или повторите одну из прошлых тренировок.
      </div>
      <button
        type="button"
        onClick={onPickTemplate}
        className="mt-4 w-full rounded-2xl bg-accent py-3 text-[14px] font-semibold text-accent-on active:scale-[0.99]"
      >
        Выбрать из базы
      </button>
      <button
        type="button"
        onClick={onPickHistory}
        disabled={!hasHistory}
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ink-muted disabled:opacity-40"
      >
        <RotateCcw size={13} /> или повторить из истории
      </button>
    </div>
  );
}

/** Заголовок группы истории: Сегодня / Вчера / «5 июня». */
function formatGroupDate(dateKey: string): string {
  if (dateKey === 'unknown') return 'Без даты';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateKey);
  if (!m) return dateKey;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} ч ${rm} мин` : `${h} ч`;
}

/** Итог подхода: факт, если есть, иначе план. */
function setSummary(s: WorkoutSetResponse): string {
  const reps = s.actualReps ?? s.plannedReps;
  const weight = s.actualWeightKg ?? s.plannedWeightKg;
  const time = s.actualTimeSec ?? s.plannedTimeSec;
  return [
    reps !== null ? `${reps}` : null,
    weight !== null ? `× ${weight} кг` : null,
    time !== null ? `${time} с` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

function exerciseSummary(ex: WorkoutExerciseResponse): string {
  const first = ex.sets[0];
  if (!first) return '';
  const head = ex.sets.length > 1 ? `${ex.sets.length}× ` : '';
  return `${head}${setSummary(first)}`;
}

function HistoryRow({
  workout,
  expanded,
  onToggle,
  onRepeat,
  repeatPending,
}: {
  workout: WorkoutResponse;
  expanded: boolean;
  onToggle: () => void;
  onRepeat: () => void;
  repeatPending: boolean;
}) {
  const skipped = workout.status === 'skipped';
  const meta = skipped
    ? 'Пропущена'
    : [
        workout.durationSec ? formatDuration(workout.durationSec) : null,
        workout.rpe ? `RPE ${workout.rpe}` : null,
        `${workout.exercises.length} упр.`,
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <li className="overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[14px] font-semibold text-ink">{workout.name}</div>
          <div className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
            {meta}
          </div>
        </button>
        <HoldToConfirm
          onConfirm={onRepeat}
          durationMs={1500}
          disabled={repeatPending || workout.exercises.length === 0}
          label="Удерживайте, чтобы повторить тренировку"
        >
          <RotateCcw size={16} strokeWidth={1.9} />
        </HoldToConfirm>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? 'Свернуть' : 'Развернуть'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card-elevated text-ink-muted active:bg-chip"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
          {workout.exercises.length === 0 && (
            <div className="text-[12px] text-ink-muted">Упражнений нет</div>
          )}
          {workout.exercises.map((ex) => (
            <div
              key={ex.position}
              className="flex items-baseline justify-between gap-2 text-[12px]"
            >
              <span className="min-w-0 truncate font-medium text-ink">{ex.exerciseName}</span>
              <span className="shrink-0 font-[family-name:var(--font-mono)] tabular-nums text-ink-muted">
                {exerciseSummary(ex)}
              </span>
            </div>
          ))}
          {workout.trainerNote && (
            <div className="pt-1 text-[12px] italic text-ink-muted">«{workout.trainerNote}»</div>
          )}
        </div>
      )}
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
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      {/* Небольшой отступ сверху с крестиком закрытия. */}
      <div className="relative z-10 flex items-center justify-end px-5 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card-elevated text-ink active:scale-95"
        >
          <X size={20} strokeWidth={1.8} />
        </button>
      </div>
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2 className="px-5 pb-2 pt-4 text-[16px] font-bold text-ink">Выберите шаблон</h2>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 pt-1">
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

function HistoryPickerSheet({
  history,
  onClose,
  onPick,
  pending,
}: {
  history: WorkoutResponse[];
  onClose: () => void;
  onPick: (workout: WorkoutResponse) => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      {/* Небольшой отступ сверху с крестиком закрытия. */}
      <div className="relative z-10 flex items-center justify-end px-5 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card-elevated text-ink active:scale-95"
        >
          <X size={20} strokeWidth={1.8} />
        </button>
      </div>
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2 className="px-5 pb-2 pt-4 text-[16px] font-bold text-ink">Повторить из истории</h2>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 pt-1">
          {history.length === 0 && <p className="text-sm text-ink-muted">История пуста.</p>}
          {history.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={pending || w.exercises.length === 0}
              onClick={() => onPick(w)}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left transition-colors active:bg-card-elevated disabled:opacity-50"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold text-ink">{w.name}</span>
                <span className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                  {formatGroupDate((w.completedAt ?? w.startedAt ?? '').slice(0, 10))} ·{' '}
                  {w.exercises.length} упр.
                </span>
              </span>
              <RotateCcw size={16} className="shrink-0 text-ink-muted" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
