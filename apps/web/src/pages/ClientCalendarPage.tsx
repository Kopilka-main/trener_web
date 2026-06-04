import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, X } from 'lucide-react';
import type { SessionResponse, SessionStatus } from '@trener/shared';
import {
  useClientSessions,
  useCreateSession,
  useDeleteSession,
  useUpdateSession,
} from '../api/sessions';
import { useClient } from '../api/clients';
import { useGyms } from '../api/gyms';
import { ScreenHeader } from '../components/ScreenHeader';
import { SessionsCalendar } from '../components/SessionsCalendar';
import { toISODate } from '../lib/calendar';
import { EMPTY_PREFS, loadLastPrefs, saveLastPrefs } from '../lib/sessionPrefs';

const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'Запланировано',
  completed: 'Проведено',
  cancelled: 'Отменено',
};

const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

/** Компактная подпись на чипе: 30м · 45м · 1ч · 1ч30м · 2ч. */
function formatDuration(min: number): string {
  if (min < 60) return `${String(min)}м`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${String(h)}ч` : `${String(h)}ч${String(rest)}м`;
}

/** Тап по пустому слоту: предзаполненные дата+время для новой сессии. */
type CreateAt = { date: string; startTime: string };

export function ClientCalendarPage() {
  const { id = '' } = useParams<{ id: string }>();
  const sessions = useClientSessions(id);
  const client = useClient(id);

  const [anchor, setAnchor] = useState<Date>(new Date());
  // null — форма закрыта; 'new' — создание без слота; SessionResponse — редактирование;
  // CreateAt — создание с предзаполненным слотом.
  const [editing, setEditing] = useState<SessionResponse | 'new' | null>(null);
  const [createAt, setCreateAt] = useState<CreateAt | null>(null);

  const list = sessions.data ?? [];

  const title = client.data
    ? `Календарь · ${client.data.firstName} ${client.data.lastName}`
    : 'Календарь';
  // Метка занятия = имя клиента (для инициалов в недельном виде).
  const clientName = client.data
    ? `${client.data.firstName} ${client.data.lastName}`.trim()
    : 'Занятие';

  const openSlot = (date: Date, hour: number) => {
    setCreateAt({ date: toISODate(date), startTime: `${String(hour).padStart(2, '0')}:00` });
    setEditing(null);
  };
  const closeForm = () => {
    setEditing(null);
    setCreateAt(null);
  };
  const formOpen = editing !== null || createAt !== null;

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title={title} back={`/clients/${id}`} />

      {sessions.isError ? (
        <p className="px-5 pt-4 text-sm text-ink-muted" role="alert">
          Не удалось загрузить занятия. Попробуйте обновить страницу.
        </p>
      ) : (
        <SessionsCalendar
          sessions={list}
          defaultView="month"
          anchor={anchor}
          onAnchorChange={setAnchor}
          onSlotClick={openSlot}
          onSessionClick={setEditing}
          renderInitials={() => clientName}
        />
      )}

      {/* FAB «+» снизу-справа — создать занятие */}
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
        <SessionSheet
          clientId={id}
          clientName={clientName}
          session={editing === 'new' || editing === null ? null : editing}
          defaultDate={createAt?.date ?? toISODate(anchor)}
          defaultStartTime={createAt?.startTime}
          onClose={closeForm}
        />
      )}
    </div>
  );
}

function SessionSheet({
  clientId,
  clientName,
  session,
  defaultDate,
  defaultStartTime,
  onClose,
}: {
  clientId: string;
  clientName: string;
  session: SessionResponse | null;
  defaultDate: string;
  defaultStartTime: string | undefined;
  onClose: () => void;
}) {
  const isEdit = session !== null;
  const gyms = useGyms();
  const gymList = gyms.data ?? [];
  const createMutation = useCreateSession(clientId);
  const updateMutation = useUpdateSession(clientId);
  const deleteMutation = useDeleteSession(clientId);

  // Подтягиваем сохранённые предпочтения только для НОВОГО занятия и только при remember.
  const prefs = useMemo(() => loadLastPrefs(), []);
  const usePrefs = !isEdit && prefs.remember;
  const initDuration = session?.durationMin ?? (usePrefs ? prefs.durationMin : 60);

  const [remember, setRemember] = useState(prefs.remember);
  const [date, setDate] = useState(session?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(session?.startTime ?? defaultStartTime ?? '12:00');
  const [title, setTitle] = useState(session?.title ?? '');
  const [location, setLocation] = useState(session?.location ?? (usePrefs ? prefs.location : ''));
  const [durationMin, setDurationMin] = useState(initDuration);
  const [customDuration, setCustomDuration] = useState(
    !DURATION_OPTIONS.includes(initDuration as (typeof DURATION_OPTIONS)[number]),
  );
  const [isOnline, setIsOnline] = useState(
    session?.isOnline ?? (usePrefs ? prefs.isOnline : false),
  );
  const [status, setStatus] = useState<SessionStatus>(session?.status ?? 'planned');
  const [showErrors, setShowErrors] = useState(false);

  function toggleRemember() {
    const next = !remember;
    setRemember(next);
    saveLastPrefs({ ...loadLastPrefs(), remember: next });
  }

  const dateError = /^\d{4}-\d{2}-\d{2}$/.test(date) ? '' : 'Укажите дату';
  const timeError = /^\d{2}:\d{2}$/.test(startTime) ? '' : 'Укажите время';
  const hasErrors = dateError !== '' || timeError !== '';

  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const mutationError = createMutation.isError || updateMutation.isError || deleteMutation.isError;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedLocation = location.trim();
    const safeDuration = Math.max(5, durationMin);
    if (isEdit && session) {
      updateMutation.mutate(
        {
          id: session.id,
          patch: {
            date,
            startTime,
            durationMin: safeDuration,
            title: trimmedTitle === '' ? null : trimmedTitle,
            location: trimmedLocation === '' ? null : trimmedLocation,
            isOnline,
            status,
          },
        },
        { onSuccess: onClose },
      );
    } else {
      // Запоминаем введённое для следующих занятий (если включён тумблер).
      saveLastPrefs(
        remember
          ? {
              remember: true,
              clientId,
              durationMin: safeDuration,
              location: trimmedLocation,
              isOnline,
            }
          : { ...EMPTY_PREFS },
      );
      createMutation.mutate(
        {
          clientId,
          date,
          startTime,
          durationMin: safeDuration,
          title: trimmedTitle === '' ? null : trimmedTitle,
          location: trimmedLocation === '' ? null : trimmedLocation,
          isOnline,
        },
        { onSuccess: onClose },
      );
    }
  }

  function handleDelete() {
    if (!session) return;
    if (!window.confirm('Удалить занятие?')) return;
    deleteMutation.mutate(session.id, { onSuccess: onClose });
  }

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
                aria-pressed={remember}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  remember ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                }`}
              >
                Запомнить
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
          {/* Клиент зафиксирован — менять нельзя. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Клиент</span>
            <span className="text-base font-semibold text-ink">{clientName}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="session-date" className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Дата</span>
              <input
                id="session-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={showErrors && dateError !== ''}
                className={`${inputClass} [color-scheme:dark] ${
                  showErrors && dateError ? 'border-danger' : ''
                }`}
              />
              {showErrors && dateError && (
                <span className="text-[12px] text-danger">{dateError}</span>
              )}
            </label>
            <label htmlFor="session-time" className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Время</span>
              <input
                id="session-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-invalid={showErrors && timeError !== ''}
                className={`${inputClass} [color-scheme:dark] ${
                  showErrors && timeError ? 'border-danger' : ''
                }`}
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

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Длительность</span>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((m) => {
                const active = !customDuration && durationMin === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setCustomDuration(false);
                      setDurationMin(m);
                    }}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      active ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                    }`}
                  >
                    {formatDuration(m)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomDuration(true)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  customDuration ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                }`}
              >
                Другое
              </button>
            </div>
            {customDuration && (
              <div className="mt-1 flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={12}
                    inputMode="numeric"
                    value={Math.floor(durationMin / 60)}
                    onChange={(e) => {
                      const h = Math.max(0, Math.min(12, Number(e.target.value) || 0));
                      setDurationMin(h * 60 + (durationMin % 60));
                    }}
                    className="w-14 rounded-xl border border-line bg-card px-3 py-2 text-center text-[15px] tabular-nums text-ink outline-none focus:border-accent"
                  />
                  <span className="text-sm text-ink-muted">ч</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    step={5}
                    inputMode="numeric"
                    value={durationMin % 60}
                    onChange={(e) => {
                      const m = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                      setDurationMin(Math.floor(durationMin / 60) * 60 + m);
                    }}
                    className="w-14 rounded-xl border border-line bg-card px-3 py-2 text-center text-[15px] tabular-nums text-ink outline-none focus:border-accent"
                  />
                  <span className="text-sm text-ink-muted">мин</span>
                </div>
                <span className="ml-auto text-[13px] font-semibold text-accent">
                  {formatDuration(Math.max(5, durationMin))}
                </span>
              </div>
            )}
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
    </div>
  );
}
