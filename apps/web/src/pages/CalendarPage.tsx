import { useMemo, useState, type FormEvent } from 'react';
import { Check, Plus, Search, Trash2, X } from 'lucide-react';
import type { ClientResponse, SessionResponse, SessionStatus } from '@trener/shared';
import { useCreateSession, useDeleteSession, useSessions, useUpdateSession } from '../api/sessions';
import { useClients } from '../api/clients';
import { useGyms } from '../api/gyms';
import { ScreenHeader } from '../components/ScreenHeader';
import { SessionsCalendar } from '../components/SessionsCalendar';
import { monthGrid, toISODate } from '../lib/calendar';
import { EMPTY_PREFS, loadLastPrefs, saveLastPrefs } from '../lib/sessionPrefs';

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
          renderInitials={(s) => nameById.get(s.clientId) ?? ''}
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
  const [clientId, setClientId] = useState(session?.clientId ?? prefClientId);
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

  // Переключение тумблера «запомнить»: сразу сохраняем флаг, чтобы следующее
  // открытие учитывало выбор (значения полей пишем при сохранении занятия).
  function toggleRemember() {
    const next = !remember;
    setRemember(next);
    saveLastPrefs({ ...loadLastPrefs(), remember: next });
  }

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
      // Запоминаем введённое для следующих занятий (если включён тумблер).
      saveLastPrefs(
        remember
          ? { remember: true, clientId, durationMin, location: trimmedLocation, isOnline }
          : { ...EMPTY_PREFS },
      );
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
          {isEdit ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Клиент</span>
              <span className="text-base font-semibold text-ink">{editClientLabel}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Клиент</span>
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
        {selected && !open && <Check size={16} className="shrink-0 text-accent" />}
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
