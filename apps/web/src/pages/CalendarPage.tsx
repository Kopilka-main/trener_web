import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2, Wifi, X } from 'lucide-react';
import type { ClientResponse, SessionResponse, SessionStatus } from '@trener/shared';
import { useCreateSession, useDeleteSession, useSessions, useUpdateSession } from '../api/sessions';
import { useClients } from '../api/clients';
import { ScreenHeader } from '../components/ScreenHeader';
import { SessionsCalendar } from '../components/SessionsCalendar';
import { monthGrid, toISODate } from '../lib/calendar';

const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'Запланировано',
  completed: 'Проведено',
  cancelled: 'Отменено',
};

const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

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

  // Загружаем занятия за диапазон, покрывающий месяц-сетку текущего якоря
  // (42 дня) — этого достаточно для day/week/month видов вокруг якоря.
  const { from, to } = useMemo(() => {
    const grid = monthGrid(anchor);
    const first = grid[0];
    const last = grid[grid.length - 1];
    return {
      from: first ? toISODate(first) : undefined,
      to: last ? toISODate(last) : undefined,
    };
  }, [anchor]);

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

  const renderLabel = (s: SessionResponse): string => nameById.get(s.clientId) ?? 'Занятие';

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Календарь" back="/" />

      {sessions.isError ? (
        <p className="px-5 pt-4 text-sm text-ink-muted" role="alert">
          Не удалось загрузить занятия. Попробуйте обновить страницу.
        </p>
      ) : (
        <SessionsCalendar
          sessions={list}
          defaultView="week"
          anchor={anchor}
          onAnchorChange={setAnchor}
          onSlotClick={openSlot}
          onSessionClick={setEditing}
          renderLabel={renderLabel}
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

function TrainerSessionSheet({
  clients,
  session,
  defaultDate,
  defaultStartTime,
  onClose,
}: {
  clients: ClientResponse[];
  session: SessionResponse | null;
  defaultDate: string;
  defaultStartTime: string | undefined;
  onClose: () => void;
}) {
  const isEdit = session !== null;
  // Активные клиенты для выбора при создании.
  const activeClients = clients.filter((c) => c.status === 'active');
  const firstActiveId = activeClients[0]?.id ?? '';

  const [clientId, setClientId] = useState(session?.clientId ?? firstActiveId);
  const [date, setDate] = useState(session?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(session?.startTime ?? defaultStartTime ?? '12:00');
  const [title, setTitle] = useState(session?.title ?? '');
  const [location, setLocation] = useState(session?.location ?? '');
  const [durationMin, setDurationMin] = useState(session?.durationMin ?? 60);
  const [isOnline, setIsOnline] = useState(session?.isOnline ?? false);
  const [status, setStatus] = useState<SessionStatus>(session?.status ?? 'planned');
  const [showErrors, setShowErrors] = useState(false);

  // clientId для инвалидации кэша: при редактировании — клиент занятия,
  // при создании — выбранный (запасной вариант — первый активный).
  const mutationClientId = session?.clientId ?? clientId;
  const createMutation = useCreateSession(mutationClientId);
  const updateMutation = useUpdateSession(mutationClientId);
  const deleteMutation = useDeleteSession(mutationClientId);

  const clientError = isEdit || clientId !== '' ? '' : 'Выберите клиента';
  const dateError = /^\d{4}-\d{2}-\d{2}$/.test(date) ? '' : 'Укажите дату';
  const timeError = /^\d{2}:\d{2}$/.test(startTime) ? '' : 'Укажите время';
  const hasErrors = clientError !== '' || dateError !== '' || timeError !== '';

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
    if (isEdit && session) {
      updateMutation.mutate(
        {
          id: session.id,
          patch: {
            date,
            startTime,
            durationMin,
            title: trimmedTitle === '' ? null : trimmedTitle,
            location: trimmedLocation === '' ? null : trimmedLocation,
            isOnline,
            status,
          },
        },
        { onSuccess: onClose },
      );
    } else {
      createMutation.mutate(
        {
          clientId,
          date,
          startTime,
          durationMin,
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

  const editClient = session ? clients.find((c) => c.id === session.clientId) : undefined;
  const editClientLabel = editClient ? clientName(editClient) : 'Клиент';

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
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-bold text-ink">{isEdit ? 'Занятие' : 'Новое занятие'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-y-auto px-5 pt-1"
        >
          {isEdit ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Клиент</span>
              <span className="text-base font-semibold text-ink">{editClientLabel}</span>
            </div>
          ) : (
            <label htmlFor="session-client" className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Клиент</span>
              <select
                id="session-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                aria-invalid={showErrors && clientError !== ''}
                className={`${inputClass} [color-scheme:dark] ${
                  showErrors && clientError ? 'border-danger' : ''
                }`}
              >
                {activeClients.length === 0 && <option value="">Нет активных клиентов</option>}
                {activeClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientName(c)}
                  </option>
                ))}
              </select>
              {showErrors && clientError && (
                <span className="text-[12px] text-danger">{clientError}</span>
              )}
            </label>
          )}

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
              {DURATION_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDurationMin(m)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    durationMin === m ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                  }`}
                >
                  {formatDuration(m)}
                </button>
              ))}
            </div>
          </div>

          <label htmlFor="session-location" className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Место</span>
            <input
              id="session-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              placeholder="Зал, адрес или ссылка"
              className={inputClass}
            />
          </label>

          <button
            type="button"
            onClick={() => setIsOnline((v) => !v)}
            className="flex items-center justify-between rounded-xl border border-line bg-chip px-3 py-2.5 text-left"
          >
            <span className="flex items-center gap-2 text-base text-ink">
              <Wifi size={18} strokeWidth={1.8} className="text-ink-muted" /> Онлайн-занятие
            </span>
            <span
              className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors ${
                isOnline ? 'bg-accent' : 'bg-card-elevated'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-bg transition-transform ${
                  isOnline ? 'translate-x-4' : ''
                }`}
              />
            </span>
          </button>

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
