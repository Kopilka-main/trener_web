import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Play, Plus, RotateCcw } from 'lucide-react';
import type { WorkoutExercisePlan, WorkoutResponse, WorkoutSetResponse } from '@trener/shared';
import { useClientMe } from '../api/auth';
import { useClientWorkouts, useCreateWorkout } from '../api/workouts';
import { useClientTemplates, useDeleteTemplate, useSaveTemplate } from '../api/templates';
import { HoldToDelete } from '../components/HoldToDelete';
import { useBackClose } from '../lib/backStack';
import { formatDateGroup, formatTime } from '../lib/workoutDates';

/** Элемент пикера «Выберите шаблон»: сохранённый шаблон или проведённая тренером тренировка. */
type TemplatePick = {
  key: string;
  name: string;
  count: number;
  body: { name: string; exercises: WorkoutExercisePlan[] };
  templateId?: string;
};

/** Повтор «точь-в-точь»: ФАКТ выполненных подходов → новый план, пропущенные исключаются. */
function repeatBody(w: WorkoutResponse): { name: string; exercises: ReturnType<typeof planEx>[] } {
  const exercises = w.exercises.map(planEx).filter((ex) => ex.sets.length > 0);
  return { name: w.name, exercises };
}

function planEx(ex: WorkoutResponse['exercises'][number]) {
  return {
    exerciseId: ex.exerciseId,
    sets: ex.sets
      .filter((s) => s.done)
      .map((s) => {
        const set: {
          plannedReps?: number;
          plannedWeightKg?: number;
          plannedTimeSec?: number;
          plannedRestSec?: number;
        } = {};
        const reps = s.actualReps ?? s.plannedReps;
        const weight = s.actualWeightKg ?? s.plannedWeightKg;
        const time = s.actualTimeSec ?? s.plannedTimeSec;
        if (reps !== null) set.plannedReps = reps;
        if (weight !== null) set.plannedWeightKg = weight;
        if (time !== null) set.plannedTimeSec = time;
        if (s.plannedRestSec !== null) set.plannedRestSec = s.plannedRestSec;
        return set;
      }),
  };
}

/** Подсчёт упражнений на карточке завершённой тренировки: показываем реально
 * выполненные (с хотя бы одним сделанным подходом). Если выполнено не всё —
 * «N из M упр.», чтобы было видно отклонение от плана; иначе просто «M упр.». */
function exercisesText(w: WorkoutResponse): string {
  const total = w.exercises.length;
  const done = w.exercises.filter((ex) =>
    ex.sets.some(
      (s) =>
        s.done || s.actualReps !== null || s.actualWeightKg !== null || s.actualTimeSec !== null,
    ),
  ).length;
  return done < total ? `${done} из ${total} упр.` : `${total} упр.`;
}

function groupByDate(workouts: WorkoutResponse[]): { label: string; items: WorkoutResponse[] }[] {
  const groups: { label: string; items: WorkoutResponse[] }[] = [];
  for (const w of workouts) {
    const label = w.completedAt ? formatDateGroup(w.completedAt) : 'Без даты';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(w);
    else groups.push({ label, items: [w] });
  }
  return groups;
}

export function WorkoutsListPage() {
  const navigate = useNavigate();
  const me = useClientMe();
  const q = useClientWorkouts();
  const create = useCreateWorkout();
  const templates = useClientTemplates();
  const delTemplate = useDeleteTemplate();
  const linked = me.data?.link != null;

  const [picker, setPicker] = useState<'none' | 'history' | 'template'>('none');

  const all = q.data ?? [];
  // Текущая тренировка (как у тренера): только запущенная (active). Пока она идёт —
  // показываем карточку «Продолжить», а не выбор шаблона. Черновики — временное
  // превью (DraftView): не запускаются и не отображаются в списке, удаляются при уходе.
  const current = all.find((w) => w.status === 'active');
  const completed = all.filter((w) => w.status === 'completed');
  const busy = create.isPending;

  // Открыть существующую тренировку (активную/итоги — страница сама разберётся).
  function open(w: WorkoutResponse) {
    void navigate(`/workouts/${w.id}/run`);
  }

  // Создать ЧЕРНОВИК-превью по плану и открыть редактируемый план (DraftView).
  // Запуск/сохранение происходит только по «Начать»; уход назад удаляет черновик.
  function createDraftAndOpen(body: { name: string; exercises: WorkoutExercisePlan[] }) {
    create.mutate(body, { onSuccess: (workout) => open(workout) });
  }

  // Повтор завершённой: клонируем ФАКТ в превью.
  function repeat(w: WorkoutResponse) {
    const body = repeatBody(w);
    if (body.exercises.length === 0) return;
    createDraftAndOpen(body);
  }

  // Элементы пикера «Выберите шаблон»: свои сохранённые шаблоны + проведённые
  // тренером тренировки. Выбор любого сразу запускает тренировку по его плану.
  const trainerWorkouts = [...all]
    .filter((w) => !w.createdByClient && w.exercises.length > 0)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const pickItems: TemplatePick[] = [
    ...(templates.data ?? []).map((t) => ({
      key: `t:${t.id}`,
      name: t.name,
      count: t.exercises.length,
      body: { name: t.name, exercises: t.exercises },
      templateId: t.id,
    })),
    ...trainerWorkouts.map((w) => ({
      key: `w:${w.id}`,
      name: w.name,
      count: w.exercises.length,
      body: templateBody(w),
    })),
  ];

  // Выбор шаблона/тренировки → открываем редактируемое превью по его плану.
  function fromPick(item: TemplatePick) {
    createDraftAndOpen(item.body);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] text-ink">Тренировки</h1>

      {!linked ? (
        <p className="text-sm text-ink-muted">
          Вы пока не подключены к тренеру. Подключите его, чтобы здесь появились назначенные
          тренировки.
        </p>
      ) : current ? (
        <ContinueCard workout={current} onOpen={() => open(current)} />
      ) : (
        <NewWorkoutCard
          busy={busy}
          hasHistory={completed.length > 0}
          onPickBase={() => setPicker('template')}
          onPickHistory={() => setPicker('history')}
        />
      )}

      {q.isLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
      {q.isError && (
        <p className="text-sm text-ink-muted">Не удалось загрузить. Потяните обновить.</p>
      )}

      {completed.length > 0 && (
        <>
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
            Завершённые
          </h2>
          {groupByDate(completed).map((g) => (
            <section key={g.label} className="flex flex-col gap-2">
              <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-mutedxl">
                {g.label}
              </h3>
              <ul className="flex flex-col gap-2">
                {g.items.map((w) => (
                  <HistoryRow key={w.id} workout={w} busy={busy} onRepeat={() => repeat(w)} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {picker === 'history' && (
        <HistoryPickerSheet
          history={completed}
          pending={busy}
          onClose={() => setPicker('none')}
          onPick={(w) => {
            setPicker('none');
            repeat(w);
          }}
        />
      )}

      {picker === 'template' && (
        <TemplatePickerSheet
          items={pickItems}
          loading={templates.isLoading || q.isLoading}
          pending={busy}
          onClose={() => setPicker('none')}
          onPick={(item) => {
            setPicker('none');
            fromPick(item);
          }}
          onDelete={(id) => delTemplate.mutate(id)}
        />
      )}
    </div>
  );
}

/** Метки упражнений: повторяющиеся имена нумеруются «Имя 1», «Имя 2»… (по position). */
function exerciseLabels(exercises: WorkoutResponse['exercises']): Map<number, string> {
  const total = new Map<string, number>();
  for (const ex of exercises) total.set(ex.exerciseName, (total.get(ex.exerciseName) ?? 0) + 1);
  const seen = new Map<string, number>();
  const labels = new Map<number, string>();
  for (const ex of exercises) {
    if ((total.get(ex.exerciseName) ?? 1) > 1) {
      const n = (seen.get(ex.exerciseName) ?? 0) + 1;
      seen.set(ex.exerciseName, n);
      labels.set(ex.position, `${ex.exerciseName} ${String(n)}`);
    } else {
      labels.set(ex.position, ex.exerciseName);
    }
  }
  return labels;
}

/** Итог подхода: факт, если есть, иначе план. */
function setSummary(s: WorkoutSetResponse): string {
  const reps = s.actualReps ?? s.plannedReps;
  const weight = s.actualWeightKg ?? s.plannedWeightKg;
  const time = s.actualTimeSec ?? s.plannedTimeSec;
  return [
    reps !== null ? String(reps) : null,
    weight !== null ? `× ${String(weight)} кг` : null,
    time !== null ? `${String(time)} с` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

function exerciseSummary(ex: WorkoutResponse['exercises'][number]): string {
  const first = ex.sets[0];
  if (!first) return '';
  const head = ex.sets.length > 1 ? `${String(ex.sets.length)}× ` : '';
  return `${head}${setSummary(first)}`;
}

/** План тренировки для сохранения как шаблон: берём план (или факт как запасной),
 * сохраняем структуру упражнений и подходов. */
function templateBody(w: WorkoutResponse): {
  name: string;
  exercises: ReturnType<typeof planEx>[];
} {
  const exercises = w.exercises
    .map((ex) => ({
      exerciseId: ex.exerciseId,
      sets: ex.sets.map((s) => {
        const set: {
          plannedReps?: number;
          plannedWeightKg?: number;
          plannedTimeSec?: number;
          plannedRestSec?: number;
        } = {};
        const reps = s.plannedReps ?? s.actualReps;
        const weight = s.plannedWeightKg ?? s.actualWeightKg;
        const time = s.plannedTimeSec ?? s.actualTimeSec;
        if (reps !== null) set.plannedReps = reps;
        if (weight !== null) set.plannedWeightKg = weight;
        if (time !== null) set.plannedTimeSec = time;
        if (s.plannedRestSec !== null) set.plannedRestSec = s.plannedRestSec;
        return set;
      }),
    }))
    .filter((ex) => ex.sets.length > 0);
  return { name: w.name, exercises };
}

/** Карточка завершённой тренировки: повтор (↺) + разворот деталей (⌄). */
function HistoryRow({
  workout,
  busy,
  onRepeat,
}: {
  workout: WorkoutResponse;
  busy: boolean;
  onRepeat: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const saveTpl = useSaveTemplate();
  const labels = exerciseLabels(workout.exercises);
  const canRepeat = workout.exercises.some((ex) => ex.sets.some((s) => s.done));
  const canSaveTemplate = workout.exercises.length > 0;
  const meta = [
    workout.completedAt ? formatTime(workout.completedAt) : null,
    exercisesText(workout),
    workout.durationSec ? `${String(Math.round(workout.durationSec / 60))} мин` : null,
    workout.rpe ? `RPE ${String(workout.rpe)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink">{workout.name}</span>
            <span className="shrink-0 rounded-md bg-chip px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
              {workout.createdByClient ? 'своя' : 'от тренера'}
            </span>
          </span>
          <span className="block font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
            {meta}
          </span>
        </button>
        <button
          type="button"
          onClick={onRepeat}
          disabled={busy || !canRepeat}
          aria-label="Повторить тренировку"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card-elevated text-ink-muted active:scale-95 disabled:opacity-40"
        >
          <RotateCcw size={16} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Свернуть' : 'Развернуть'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card-elevated text-ink-muted active:scale-95"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
          {workout.exercises.length === 0 && (
            <span className="text-[12px] text-ink-muted">Упражнений нет</span>
          )}
          {workout.exercises.map((ex) => (
            <div
              key={ex.position}
              className="flex items-baseline justify-between gap-2 text-[12px]"
            >
              <span className="min-w-0 truncate font-medium text-ink">
                {labels.get(ex.position) ?? ex.exerciseName}
              </span>
              <span className="shrink-0 font-[family-name:var(--font-mono)] tabular-nums text-ink-muted">
                {exerciseSummary(ex)}
              </span>
            </div>
          ))}
          {workout.trainerNote && (
            <div className="pt-1 text-[12px] italic text-ink-muted">«{workout.trainerNote}»</div>
          )}
          <button
            type="button"
            onClick={() => saveTpl.mutate(templateBody(workout))}
            disabled={!canSaveTemplate || saveTpl.isPending || saveTpl.isSuccess}
            className="mt-1 self-start rounded-xl bg-card-elevated px-3 py-2 text-[12px] font-semibold text-ink active:opacity-90 disabled:opacity-50"
          >
            {saveTpl.isSuccess
              ? 'В шаблонах ✓'
              : saveTpl.isPending
                ? 'Сохраняем…'
                : 'Сохранить как шаблон'}
          </button>
        </div>
      )}
    </li>
  );
}

/** Карточка текущей тренировки (активная/черновик) — как у тренера: «идёт» + «Продолжить». */
function ContinueCard({ workout, onOpen }: { workout: WorkoutResponse; onOpen: () => void }) {
  const active = workout.status === 'active';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-3 rounded-3xl bg-card p-4 text-left active:scale-[0.99]"
    >
      <div className="min-w-0">
        <div className="truncate text-[18px] font-bold text-ink">{workout.name}</div>
        <div className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
          {workout.exercises.length} упр.{active ? ' · идёт' : ''}
        </div>
      </div>
      <span className="flex items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-[15px] font-semibold text-accent-on">
        <Play size={16} fill="currentColor" /> {active ? 'Продолжить' : 'Начать тренировку'}
      </span>
    </button>
  );
}

/** Карточка-плейсхолдер новой тренировки: выбрать из базы или повторить. */
function NewWorkoutCard({
  busy,
  hasHistory,
  onPickBase,
  onPickHistory,
}: {
  busy: boolean;
  hasHistory: boolean;
  onPickBase: () => void;
  onPickHistory: () => void;
}) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-line p-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-chip text-ink">
        <Plus size={20} />
      </div>
      <div className="mt-3 text-[15px] font-semibold text-ink">Тренировка не запланирована</div>
      <div className="mx-auto mt-1 max-w-[280px] text-[12px] text-ink-muted">
        Выберите готовый шаблон — и сразу тренируйтесь.
      </div>
      <button
        type="button"
        onClick={onPickBase}
        disabled={busy}
        className="mt-4 w-full rounded-2xl bg-accent py-3 text-[14px] font-semibold text-accent-on active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? 'Запускаем…' : 'Выбрать из базы'}
      </button>
      <button
        type="button"
        onClick={onPickHistory}
        disabled={!hasHistory || busy}
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ink-muted disabled:opacity-40"
      >
        <RotateCcw size={13} /> или повторить из истории
      </button>
    </div>
  );
}

/** Лист выбора шаблона тренировки (интерфейс как у тренера): свои сохранённые
 * шаблоны и проведённые тренером тренировки. */
function TemplatePickerSheet({
  items,
  loading,
  pending,
  onClose,
  onPick,
  onDelete,
}: {
  items: TemplatePick[];
  loading: boolean;
  pending: boolean;
  onClose: () => void;
  onPick: (item: TemplatePick) => void;
  onDelete: (id: string) => void;
}) {
  useBackClose(onClose);
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="pointer-events-none relative z-10 h-12 pt-[max(0.75rem,env(safe-area-inset-top))]" />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2 className="px-5 pb-2 pt-4 text-[16px] font-bold text-ink">Выберите шаблон</h2>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 pt-1">
          {loading && <p className="text-sm text-ink-muted">Загрузка…</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-ink-muted">
              Шаблонов пока нет. Они появятся из проведённых тренером тренировок или когда вы
              сохраните тренировку как шаблон.
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-2 rounded-2xl bg-card pr-2 active:bg-card-elevated"
            >
              <button
                type="button"
                disabled={pending}
                onClick={() => onPick(item)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left disabled:opacity-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums text-ink">
                  {item.count}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                    {item.count} упр.
                  </span>
                </span>
              </button>
              {item.templateId !== undefined && (
                <HoldToDelete
                  icon="trash"
                  label="Удерживайте, чтобы удалить шаблон"
                  onDelete={() => onDelete(item.templateId!)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Лист выбора прошлой тренировки для повтора. */
function HistoryPickerSheet({
  history,
  pending,
  onClose,
  onPick,
}: {
  history: WorkoutResponse[];
  pending: boolean;
  onClose: () => void;
  onPick: (workout: WorkoutResponse) => void;
}) {
  useBackClose(onClose);
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="pointer-events-none relative z-10 h-12 pt-[max(0.75rem,env(safe-area-inset-top))]" />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2 className="px-5 pb-2 pt-4 text-[16px] font-bold text-ink">Повторить из истории</h2>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 pt-1">
          {history.length === 0 && <p className="text-sm text-ink-muted">История пуста.</p>}
          {history.map((w) => {
            const canRepeat = w.exercises.some((ex) => ex.sets.some((s) => s.done));
            return (
              <button
                key={w.id}
                type="button"
                disabled={pending || !canRepeat}
                onClick={() => onPick(w)}
                className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left transition-colors active:bg-card-elevated disabled:opacity-50"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold text-ink">{w.name}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                    {w.completedAt ? formatDateGroup(w.completedAt) : 'Без даты'} ·{' '}
                    {exercisesText(w)}
                  </span>
                </span>
                <RotateCcw size={16} className="shrink-0 text-ink-muted" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
