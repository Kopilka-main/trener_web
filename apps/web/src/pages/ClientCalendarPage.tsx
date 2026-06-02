import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, Plus, Trash2, Wifi, X } from 'lucide-react';
import type { SessionResponse, SessionStatus } from '@trener/shared';
import {
  useClientSessions,
  useCreateSession,
  useDeleteSession,
  useUpdateSession,
} from '../api/sessions';
import { ScreenHeader } from '../components/ScreenHeader';

const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'Запланировано',
  completed: 'Проведено',
  cancelled: 'Отменено',
};

const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

/** Локальная дата «сегодня» в формате YYYY-MM-DD (без сдвига часового пояса). */
function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Читаемая дата занятия (ru): «5 июня, чт». */
function formatSessionDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
}

function formatDuration(min: number): string {
  if (min < 60) return `${String(min)} мин`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${String(h)} ч` : `${String(h)} ч ${String(rest)} мин`;
}

export function ClientCalendarPage() {
  const { id = '' } = useParams<{ id: string }>();
  const sessions = useClientSessions(id);
  const [editing, setEditing] = useState<SessionResponse | 'new' | null>(null);

  const list = sessions.data ?? [];
  const today = todayStr();

  const upcoming = useMemo(
    () =>
      list
        .filter((s) => s.date >= today)
        .sort((a, b) =>
          a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
        ),
    [list, today],
  );
  const past = useMemo(
    () =>
      list
        .filter((s) => s.date < today)
        .sort((a, b) =>
          a.date === b.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date),
        ),
    [list, today],
  );

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Календарь" back={`/clients/${id}`} />

      <div className="flex flex-1 flex-col gap-6 px-5 pb-28 pt-2">
        {sessions.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {sessions.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось загрузить занятия. Попробуйте обновить страницу.
          </p>
        )}

        {sessions.isSuccess && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center">
            <CalendarDays size={28} strokeWidth={1.6} className="text-ink-muted" />
            <p className="text-sm text-ink-muted">Пока нет занятий. Запланируйте первое.</p>
          </div>
        )}

        {upcoming.length > 0 && (
          <Section title="Предстоящие">
            {upcoming.map((s) => (
              <SessionRow key={s.id} session={s} onClick={() => setEditing(s)} />
            ))}
          </Section>
        )}

        {past.length > 0 && (
          <Section title="Прошедшие">
            {past.map((s) => (
              <SessionRow key={s.id} session={s} onClick={() => setEditing(s)} />
            ))}
          </Section>
        )}
      </div>

      <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex justify-end px-5">
        <button
          type="button"
          onClick={() => setEditing('new')}
          aria-label="Запланировать занятие"
          className="tile-shadow-primary pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full active:scale-[0.95]"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>
      </div>

      {editing !== null && (
        <SessionSheet
          clientId={id}
          session={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
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

function SessionRow({ session, onClick }: { session: SessionResponse; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="row-glow flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left transition-colors active:bg-card-elevated"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold text-ink">
            {session.title ?? 'Занятие'}
          </span>
          <span className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
            <span className="rounded-full bg-chip px-2 py-0.5 uppercase tracking-[0.04em]">
              {STATUS_LABEL[session.status]}
            </span>
            <span>
              {formatSessionDate(session.date)} · {session.startTime}
            </span>
            <span>· {formatDuration(session.durationMin)}</span>
            {session.isOnline && (
              <span className="inline-flex items-center gap-1">
                <Wifi size={12} strokeWidth={2} /> онлайн
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function SessionSheet({
  clientId,
  session,
  onClose,
}: {
  clientId: string;
  session: SessionResponse | null;
  onClose: () => void;
}) {
  const isEdit = session !== null;
  const createMutation = useCreateSession(clientId);
  const updateMutation = useUpdateSession(clientId);
  const deleteMutation = useDeleteSession(clientId);

  const [date, setDate] = useState(session?.date ?? todayStr());
  const [startTime, setStartTime] = useState(session?.startTime ?? '12:00');
  const [title, setTitle] = useState(session?.title ?? '');
  const [location, setLocation] = useState(session?.location ?? '');
  const [durationMin, setDurationMin] = useState(session?.durationMin ?? 60);
  const [isOnline, setIsOnline] = useState(session?.isOnline ?? false);
  const [status, setStatus] = useState<SessionStatus>(session?.status ?? 'planned');
  const [showErrors, setShowErrors] = useState(false);

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
