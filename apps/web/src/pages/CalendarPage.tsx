import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, ChevronRight, Dumbbell, Plus, Search, Trash2, X } from 'lucide-react';
import type {
  ClientResponse,
  CreateWorkoutRequest,
  SessionResponse,
  SessionStatus,
  TemplateResponse,
  WorkoutResponse,
} from '@trener/shared';
import { useCreateSession, useDeleteSession, useSessions, useUpdateSession } from '../api/sessions';
import { useClients } from '../api/clients';
import { useClientWorkouts, useCreateWorkout } from '../api/client-workouts';
import { useTemplates } from '../api/workout-templates';
import { useGyms } from '../api/gyms';
import { ScreenHeader } from '../components/ScreenHeader';
import { SessionsCalendar } from '../components/SessionsCalendar';
import { addDays, startOfWeek, toISODate } from '../lib/calendar';
import { rankBySearch } from '../lib/search';
import { EMPTY_PREFS, loadLastPrefs, saveLastPrefs } from '../lib/sessionPrefs';

/** Тренировка, выбранная для занятия: уже привязанная / из шаблона / из истории клиента. */
type PlannedWorkout =
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'template'; template: TemplateResponse }
  | { kind: 'history'; workout: WorkoutResponse };

/** Текущая (ещё не проведённая) тренировка — черновик или активная. */
function isCurrentWorkout(w: WorkoutResponse): boolean {
  return w.status === 'active' || w.status === 'draft';
}

function workoutDateMs(w: WorkoutResponse): number {
  const raw = w.completedAt ?? w.startedAt;
  return raw ? Date.parse(raw) : 0;
}

/** План новой тренировки клиента из шаблона (разворачиваем подходы в плоские записи). */
function bodyFromTemplate(t: TemplateResponse): CreateWorkoutRequest {
  return {
    name: t.name,
    sourceTemplateId: t.id,
    exercises: t.exercises.flatMap((ex) =>
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
}

/** План новой тренировки из прошлой (повтор «как провели» — только выполненные подходы). */
function bodyFromHistory(w: WorkoutResponse): CreateWorkoutRequest | null {
  const exercises = w.exercises
    .map((ex) => ({
      exerciseId: ex.exerciseId,
      sets: ex.sets
        .filter((s) => s.done)
        .map((s) => ({
          plannedReps: s.actualReps ?? s.plannedReps,
          plannedWeightKg: s.actualWeightKg ?? s.plannedWeightKg,
          plannedTimeSec: s.actualTimeSec ?? s.plannedTimeSec,
          plannedRestSec: s.plannedRestSec,
        })),
    }))
    .filter((ex) => ex.sets.length > 0);
  if (exercises.length === 0) return null;
  return { name: w.name, exercises };
}

/** Подпись выбранной тренировки для поля формы. */
function plannedWorkoutName(p: PlannedWorkout): string {
  if (p.kind === 'existing') return p.name;
  if (p.kind === 'template') return p.template.name;
  return p.workout.name;
}

// Дата занятия: ручной ввод ДД.ММ.ГГГГ ↔ хранение ISO YYYY-MM-DD.
function isoToDmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
function maskDmy(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('.');
}
function dmyToIso(display: string): string | null {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const y = Number(yyyy);
  if (y < 1900 || y > 2100) return null;
  const dt = new Date(y, Number(mm) - 1, Number(dd));
  if (dt.getFullYear() !== y || dt.getMonth() !== Number(mm) - 1 || dt.getDate() !== Number(dd)) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

// Время — ручной ввод ЧЧ:ММ (24ч). Нативный <input type="time"> в 12ч-локали мешает
// набрать, например, 15:00 — поэтому маскируем текстом сами.
function maskTime(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2, 4)}`;
}
function isValidTime(t: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'Запланировано',
  completed: 'Проведено',
  cancelled: 'Отменено',
};

function formatDuration(min: number): string {
  if (min < 60) return `${String(min)} мин`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${String(h)} ч` : `${String(h)} ч ${String(rest)} мин`;
}

function clientName(c: ClientResponse): string {
  return `${c.firstName} ${c.lastName}`;
}

/** Тап по пустому слоту: предзаполненные дата+время для новой сессии. */
type CreateAt = { date: string; startTime: string };

/**
 * Тренерский календарь всех занятий (по всем клиентам).
 * Онлайн-тренировки в тренерском календаре не показываются.
 */
export function CalendarPage() {
  const [anchor, setAnchor] = useState<Date>(new Date());

  // Базовый диапазон вокруг опорной недели — для видов «День»/«Месяц» и стартовой недели.
  const base = useMemo(() => {
    const ws = startOfWeek(anchor);
    return { from: toISODate(addDays(ws, -3 * 7)), to: toISODate(addDays(ws, 5 * 7)) };
  }, [anchor]);

  // Диапазон скользящего окна недельной ленты (растёт/смещается при прокрутке).
  // Сбрасывается при смене якоря (см. onAnchorChange) — лента строится вокруг новой недели.
  const [weekRange, setWeekRange] = useState<{ from: string; to: string } | null>(null);

  // Грузим объединение базового и недельного диапазонов (строки ISO сравнимы лексикографически).
  const from = weekRange && weekRange.from < base.from ? weekRange.from : base.from;
  const to = weekRange && weekRange.to > base.to ? weekRange.to : base.to;

  const sessions = useSessions(from, to);
  const clients = useClients();

  // Бизнес-правило: онлайн-тренировки не показываются в тренерском календаре.
  const list = useMemo(
    () => (sessions.data ?? []).filter((s) => s.isOnline === false),
    [sessions.data],
  );

  // Карта clientId → "Имя Фамилия" для меток блоков.
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients.data ?? []) map.set(c.id, clientName(c));
    return map;
  }, [clients.data]);

  // null — форма закрыта; 'new' — создание без слота; SessionResponse — редактирование;
  const [editing, setEditing] = useState<SessionResponse | 'new' | null>(null);
  const [createAt, setCreateAt] = useState<CreateAt | null>(null);

  const openSlot = (date: Date, hour: number) => {
    setCreateAt({ date: toISODate(date), startTime: `${String(hour).padStart(2, '0')}:00` });
    setEditing(null);
  };
  const closeForm = () => {
    setEditing(null);
    setCreateAt(null);
  };
  const formOpen = editing !== null || createAt !== null;

  const renderLabel = (s: SessionResponse): string =>
    nameById.get(s.clientId) ?? s.title ?? 'Занятие';

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Календарь" back="/" />

      {sessions.isError ? (
        <p className="px-2 pt-4 text-sm text-ink-muted" role="alert">
          Не удалось загрузить занятия. Попробуйте обновить страницу.
        </p>
      ) : (
        <SessionsCalendar
          sessions={list}
          defaultView="week"
          anchor={anchor}
          onAnchorChange={(d) => {
            setWeekRange(null);
            setAnchor(d);
          }}
          onSlotClick={openSlot}
          onSessionClick={setEditing}
          renderLabel={renderLabel}
          onRangeChange={(f, t) => setWeekRange({ from: toISODate(f), to: toISODate(t) })}
        />
      )}

      {/* FAB «+» снизу-справа — создать занятие (дата = anchor) */}
      <button
        type="button"
        onClick={() => {
          setEditing('new');
          setCreateAt(null);
        }}
        aria-label="Запланировать занятие"
        className="tile-shadow-primary fixed bottom-4 right-5 z-20 flex h-14 w-14 shrink-0 items-center justify-center rounded-full active:scale-[0.95]"
      >
        <Plus size={24} strokeWidth={2.2} />
      </button>

      {formOpen && (
        <TrainerSessionSheet
          clients={clients.data ?? []}
          session={editing === 'new' || editing === null ? null : editing}
          defaultDate={createAt?.date ?? toISODate(anchor)}
          defaultStartTime={createAt?.startTime}
          onClose={closeForm}
        />
      )}
    </div>
  );
}

export function TrainerSessionSheet({
  clients,
  fixedClient,
  session,
  defaultDate,
  defaultStartTime,
  onClose,
}: {
  clients: ClientResponse[];
  /** Зафиксированный клиент (календарь конкретного клиента) — поле не редактируется. */
  fixedClient?: { id: string; name: string };
  session: SessionResponse | null;
  defaultDate: string;
  defaultStartTime: string | undefined;
  onClose: () => void;
}) {
  const isEdit = session !== null;
  // Активные клиенты для выбора при создании.
  const activeClients = clients.filter((c) => c.status === 'active');
  const gyms = useGyms();
  const gymList = gyms.data ?? [];

  // Подтягиваем сохранённые предпочтения только для НОВОГО занятия и только при remember.
  const prefs = useMemo(() => loadLastPrefs(), []);
  const usePrefs = !isEdit && prefs.remember;
  // Запомненный клиент берём, только если он ещё активен.
  const prefClientId =
    usePrefs && activeClients.some((c) => c.id === prefs.clientId) ? prefs.clientId : '';
  const initDuration = session?.durationMin ?? (usePrefs ? prefs.durationMin : 60);

  const [remember, setRemember] = useState(prefs.remember);
  const [clientId, setClientId] = useState(session?.clientId ?? fixedClient?.id ?? prefClientId);
  // Дата — текстом ДД.ММ.ГГГГ; ISO для API считаем из неё (dmyToIso).
  const [dateInput, setDateInput] = useState(() => isoToDmy(session?.date ?? defaultDate));
  const [startTime, setStartTime] = useState(session?.startTime ?? defaultStartTime ?? '12:00');
  const [title, setTitle] = useState(session?.title ?? '');
  const [location, setLocation] = useState(session?.location ?? (usePrefs ? prefs.location : ''));
  const [durationMin, setDurationMin] = useState(initDuration);
  const [isOnline, setIsOnline] = useState(
    session?.isOnline ?? (usePrefs ? prefs.isOnline : false),
  );
  const [status, setStatus] = useState<SessionStatus>(session?.status ?? 'planned');
  const [showErrors, setShowErrors] = useState(false);

  // Запланированная тренировка для занятия (шаблон / история / уже привязанная).
  const [plannedWorkout, setPlannedWorkout] = useState<PlannedWorkout | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Переключение тумблера «запомнить»: сразу сохраняем флаг, чтобы следующее
  // открытие учитывало выбор (значения полей пишем при сохранении занятия).
  function toggleRemember() {
    const next = !remember;
    setRemember(next);
    saveLastPrefs({ ...loadLastPrefs(), remember: next });
  }

  // clientId для инвалидации кэша: при редактировании — клиент занятия,
  // при создании — выбранный (запасной вариант — первый активный).
  const mutationClientId = fixedClient?.id ?? session?.clientId ?? clientId;
  const createMutation = useCreateSession(mutationClientId);
  const updateMutation = useUpdateSession(mutationClientId);
  const deleteMutation = useDeleteSession(mutationClientId);
  const createWorkout = useCreateWorkout(mutationClientId);

  // Шаблоны (всегда) и история тренировок клиента (только если клиент выбран).
  const templates = useTemplates().data ?? [];
  const clientWorkouts = useClientWorkouts(mutationClientId).data ?? [];
  const history = useMemo(
    () =>
      clientWorkouts
        .filter((w) => !isCurrentWorkout(w))
        .sort((a, b) => workoutDateMs(b) - workoutDateMs(a)),
    [clientWorkouts],
  );

  // Уже привязанная к занятию тренировка: подтягиваем её имя из списка тренировок клиента.
  useEffect(() => {
    const wid = session?.workoutId;
    if (!wid) return;
    setPlannedWorkout((prev) => {
      if (prev) return prev;
      const w = clientWorkouts.find((x) => x.id === wid);
      return { kind: 'existing', id: wid, name: w?.name ?? 'Тренировка' };
    });
  }, [session?.workoutId, clientWorkouts]);

  const dateIso = dmyToIso(dateInput);
  // Клиент необязателен — можно запланировать занятие без него.
  const clientError = '';
  const dateError = dateIso ? '' : 'Дата в формате ДД.ММ.ГГГГ';
  const timeError = isValidTime(startTime) ? '' : 'Время в формате ЧЧ:ММ';
  const hasErrors = clientError !== '' || dateError !== '' || timeError !== '';

  const pending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    createWorkout.isPending;
  const mutationError = createMutation.isError || updateMutation.isError || deleteMutation.isError;

  // Если выбран шаблон/история — создаём клиенту черновик тренировки и возвращаем его id.
  // Уже привязанная остаётся как есть; «без тренировки» → null (отвязать).
  async function resolveWorkoutId(): Promise<string | null> {
    if (!plannedWorkout) return null;
    if (plannedWorkout.kind === 'existing') return plannedWorkout.id;
    // Создать тренировку из шаблона/истории можно только когда выбран клиент.
    if (mutationClientId === '') return null;
    const body =
      plannedWorkout.kind === 'template'
        ? bodyFromTemplate(plannedWorkout.template)
        : bodyFromHistory(plannedWorkout.workout);
    if (!body) return null;
    const workout = await createWorkout.mutateAsync(body);
    return workout.id;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedLocation = location.trim();
    if (!dateIso) return; // подстраховка типов — выше hasErrors уже это проверил
    void (async () => {
      let workoutId: string | null;
      try {
        workoutId = await resolveWorkoutId();
      } catch {
        return; // ошибка создания тренировки — состояние мутации покажет сбой
      }
      if (isEdit && session) {
        updateMutation.mutate(
          {
            id: session.id,
            patch: {
              date: dateIso,
              startTime,
              durationMin,
              title: trimmedTitle === '' ? null : trimmedTitle,
              location: trimmedLocation === '' ? null : trimmedLocation,
              isOnline,
              status,
              workoutId,
            },
          },
          { onSuccess: onClose },
        );
      } else {
        // Запоминаем введённое для следующих занятий (если включён тумблер).
        saveLastPrefs(
          remember
            ? { remember: true, clientId, durationMin, location: trimmedLocation, isOnline }
            : { ...EMPTY_PREFS },
        );
        createMutation.mutate(
          {
            clientId: mutationClientId,
            date: dateIso,
            startTime,
            durationMin,
            title: trimmedTitle === '' ? null : trimmedTitle,
            location: trimmedLocation === '' ? null : trimmedLocation,
            isOnline,
            workoutId,
          },
          { onSuccess: onClose },
        );
      }
    })();
  }

  function handleDelete() {
    if (!session) return;
    if (!window.confirm('Удалить занятие?')) return;
    deleteMutation.mutate(session.id, { onSuccess: onClose });
  }

  const editClient = session ? clients.find((c) => c.id === session.clientId) : undefined;
  const editClientLabel = editClient ? clientName(editClient) : 'Без клиента';

  const inputClass =
    'w-full rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 flex max-h-[88vh] flex-col rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-bold text-ink">{isEdit ? 'Занятие' : 'Новое занятие'}</h2>
          <div className="flex items-center gap-2">
            {!isEdit && (
              <button
                type="button"
                onClick={toggleRemember}
                role="switch"
                aria-checked={remember}
                aria-label="Запомнить параметры занятия"
                className="flex items-center gap-2"
              >
                <span className="text-[12px] font-semibold text-ink-muted">Запомнить</span>
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                    remember ? 'bg-accent' : 'bg-chip'
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      remember ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
            >
              <X size={20} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-y-auto px-5 pt-1"
        >
          {fixedClient || isEdit ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Клиент</span>
              <span className="text-base font-semibold text-ink">
                {fixedClient?.name ?? editClientLabel}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Клиент · необязательно</span>
              <ClientSearchSelect
                clients={activeClients}
                value={clientId}
                onChange={setClientId}
                invalid={showErrors && clientError !== ''}
              />
              {showErrors && clientError && (
                <span className="text-[12px] text-danger">{clientError}</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="session-date" className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Дата</span>
              <input
                id="session-date"
                type="text"
                inputMode="numeric"
                value={dateInput}
                onChange={(e) => setDateInput(maskDmy(e.target.value))}
                placeholder="ДД.ММ.ГГГГ"
                aria-invalid={showErrors && dateError !== ''}
                className={`${inputClass} ${showErrors && dateError ? 'border-danger' : ''}`}
              />
              {showErrors && dateError && (
                <span className="text-[12px] text-danger">{dateError}</span>
              )}
            </label>
            <label htmlFor="session-time" className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Время</span>
              <input
                id="session-time"
                type="text"
                inputMode="numeric"
                value={startTime}
                onChange={(e) => setStartTime(maskTime(e.target.value))}
                placeholder="ЧЧ:ММ"
                aria-invalid={showErrors && timeError !== ''}
                className={`${inputClass} ${showErrors && timeError ? 'border-danger' : ''}`}
              />
              {showErrors && timeError && (
                <span className="text-[12px] text-danger">{timeError}</span>
              )}
            </label>
          </div>

          <label htmlFor="session-title" className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Название</span>
            <input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Например, силовая тренировка"
              className={inputClass}
            />
          </label>

          {/* Тренировка-план: шаблон (всегда) или история клиента (если клиент выбран). */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Тренировка</span>
            {plannedWorkout ? (
              <div className="flex items-center gap-2 rounded-xl border border-line bg-chip px-3 py-2.5">
                <Dumbbell size={16} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate text-base text-ink">
                  {plannedWorkoutName(plannedWorkout)}
                </span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="shrink-0 text-[13px] font-semibold text-accent-text"
                >
                  Изменить
                </button>
                <button
                  type="button"
                  onClick={() => setPlannedWorkout(null)}
                  aria-label="Убрать тренировку"
                  className="shrink-0 text-ink-muted active:text-ink"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-dashed border-line bg-chip px-3 py-2.5 text-left text-ink-muted active:bg-card-elevated"
              >
                <Plus size={16} strokeWidth={2.2} className="shrink-0" />
                <span className="text-base">Выбрать тренировку</span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Длительность</span>
            {/* Нативный пикер времени: один тап = «барабан» на iPhone / часы на Android.
                По умолчанию 1 ч; значение ЧЧ:ММ трактуем как длительность. */}
            <div className="flex items-center gap-3">
              <input
                type="time"
                step={300}
                value={`${String(Math.floor(durationMin / 60)).padStart(2, '0')}:${String(
                  durationMin % 60,
                ).padStart(2, '0')}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  const total = (h ?? 0) * 60 + (m ?? 0);
                  setDurationMin(total > 0 ? total : 5);
                }}
                aria-label="Длительность (часы и минуты)"
                className="rounded-xl border border-line bg-card px-4 py-2.5 text-[15px] tabular-nums text-ink outline-none [color-scheme:dark] focus:border-accent"
              />
              <span className="text-[12px] text-ink-muted">часы : минуты</span>
              <span className="ml-auto text-[13px] font-semibold text-accent-text">
                {formatDuration(Math.max(5, durationMin))}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Место</span>
            <div className="flex flex-wrap gap-1.5">
              {gymList.map((g) => {
                const active = !isOnline && location === g.name;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setIsOnline(false);
                      setLocation(g.name);
                    }}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      active ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setIsOnline(true);
                  setLocation('');
                }}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  isOnline ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                }`}
              >
                Online
              </button>
            </div>
            {gymList.length === 0 && (
              <span className="text-[12px] text-ink-mutedxl">
                Залы можно добавить в профиле тренера.
              </span>
            )}
          </div>

          {isEdit && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Статус</span>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STATUS_LABEL) as SessionStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      status === s ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mutationError && (
            <p className="text-sm text-ink-muted" role="alert">
              Не удалось сохранить. Попробуйте снова.
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded-2xl bg-accent py-3.5 text-[15px] font-bold text-accent-on active:opacity-90 disabled:opacity-50"
          >
            {pending ? '…' : isEdit ? 'Сохранить' : 'Запланировать'}
          </button>

          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="mb-1 flex items-center justify-center gap-2 rounded-2xl bg-card py-3.5 text-[14px] font-semibold text-ink active:bg-card-elevated disabled:opacity-50"
            >
              <Trash2 size={18} strokeWidth={1.8} className="text-danger" /> Удалить занятие
            </button>
          )}
        </form>
      </div>

      {pickerOpen && (
        <WorkoutPickerSheet
          templates={templates}
          history={history}
          clientSelected={mutationClientId !== ''}
          onPickTemplate={(t) => {
            setPlannedWorkout({ kind: 'template', template: t });
            setPickerOpen(false);
          }}
          onPickHistory={(w) => {
            setPlannedWorkout({ kind: 'history', workout: w });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Пикер тренировки для занятия: шаблоны (всегда) и история клиента (если выбран).
 * Выбор не создаёт тренировку сразу — она создаётся клиенту при сохранении занятия.
 */
function WorkoutPickerSheet({
  templates,
  history,
  clientSelected,
  onPickTemplate,
  onPickHistory,
  onClose,
}: {
  templates: TemplateResponse[];
  history: WorkoutResponse[];
  clientSelected: boolean;
  onPickTemplate: (t: TemplateResponse) => void;
  onPickHistory: (w: WorkoutResponse) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const visibleTemplates = rankBySearch(templates, query, (t) => t.name);
  const visibleHistory = rankBySearch(history, query, (w) => w.name);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 flex max-h-[88vh] flex-col rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-bold text-ink">Тренировка для занятия</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        {/* Поиск по названию (шаблоны + история). */}
        <div className="px-5 pb-2 pt-1">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск тренировки"
              aria-label="Поиск тренировки"
              className="w-full rounded-2xl border border-line bg-chip py-2.5 pl-9 pr-9 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
            />
            {query !== '' && (
              <button
                type="button"
                aria-label="Очистить"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted active:text-ink"
              >
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-2 pt-1">
          {/* Шаблоны — доступны всегда. */}
          <section className="flex flex-col gap-2">
            <h3 className="font-[family-name:var(--font-mono)] text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Шаблоны
            </h3>
            {templates.length === 0 ? (
              <p className="text-[13px] text-ink-muted">
                Шаблонов пока нет — создайте их в базе знаний.
              </p>
            ) : visibleTemplates.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Ничего не найдено.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {visibleTemplates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onPickTemplate(t)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left active:bg-card-elevated"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-semibold text-ink">
                          {t.name}
                        </span>
                        <span className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                          {t.exercises.length} упр.{t.categoryTag ? ` · ${t.categoryTag}` : ''}
                        </span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-ink-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* История клиента — только если клиент выбран. */}
          {clientSelected && (
            <section className="flex flex-col gap-2">
              <h3 className="font-[family-name:var(--font-mono)] text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                История клиента
              </h3>
              {history.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  У клиента пока нет проведённых тренировок.
                </p>
              ) : visibleHistory.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Ничего не найдено.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {visibleHistory.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        disabled={w.exercises.length === 0}
                        onClick={() => onPickHistory(w)}
                        className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left active:bg-card-elevated disabled:opacity-40"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-semibold text-ink">
                            {w.name}
                          </span>
                          <span className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                            {formatWorkoutDate(w)} · {w.exercises.length} упр.
                          </span>
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-ink-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Дата проведённой тренировки для строки истории (ДД/ММ/ГГГГ). */
function formatWorkoutDate(w: WorkoutResponse): string {
  const iso = (w.completedAt ?? w.startedAt ?? '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'без даты';
}

/** Поиск-выбор клиента по имени, контактам или тегам (вместо нативного select). */
function ClientSearchSelect({
  clients,
  value,
  onChange,
  invalid,
}: {
  clients: ClientResponse[];
  value: string;
  onChange: (id: string) => void;
  invalid: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return clients;
    return clients.filter((c) => {
      if (`${c.firstName} ${c.lastName}`.toLowerCase().includes(q)) return true;
      if (
        c.contacts.some(
          (ct) => ct.value.toLowerCase().includes(q) || ct.type.toLowerCase().includes(q),
        )
      )
        return true;
      return c.tags.some((t) => t.toLowerCase().includes(q));
    });
  }, [clients, query]);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`flex items-center gap-2 rounded-xl border bg-chip px-3 py-2.5 ${
          invalid ? 'border-danger' : 'border-line'
        }`}
      >
        <Search size={16} className="shrink-0 text-ink-mutedxl" />
        <input
          value={open ? query : selected ? `${selected.firstName} ${selected.lastName}` : ''}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Поиск клиента по имени или контакту"
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-mutedxl"
        />
        {selected && !open && <Check size={16} className="shrink-0 text-accent-text" />}
      </div>

      {open && (
        <ul className="max-h-52 overflow-y-auto rounded-xl border border-line bg-card">
          {filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-[13px] text-ink-muted">Никого не найдено</li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(c.id);
                    setQuery('');
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left active:bg-card-elevated ${
                    c.id === value ? 'bg-card-elevated' : ''
                  }`}
                >
                  <span className="text-[14px] font-semibold text-ink">
                    {c.firstName} {c.lastName}
                  </span>
                  {(() => {
                    // Первый контакт, кроме e-mail (по типу или наличию «@»).
                    const ct = c.contacts.find(
                      (x) => x.type.toLowerCase() !== 'email' && !x.value.includes('@'),
                    );
                    return ct ? (
                      <span className="truncate text-[12px] text-ink-muted">
                        {ct.type}: {ct.value}
                      </span>
                    ) : null;
                  })()}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
