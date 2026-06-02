import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Trash2, X } from 'lucide-react';
import type { Contact } from '@trener/shared';
import { useClient, useCreateClient, useDeleteClient, useUpdateClient } from '../api/clients';
import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';

interface ClientEditPageProps {
  mode: 'create' | 'edit';
}

const CONTACT_TYPES = ['Телефон', 'WhatsApp', 'Telegram', 'MAX', 'Instagram', 'Прочее'] as const;

export function ClientEditPage({ mode }: ClientEditPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const editing = mode === 'edit';

  const existing = useClient(editing ? id : '');
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient(id);
  const deleteMutation = useDeleteClient();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [notes, setNotes] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [accountId, setAccountId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (editing && existing.data) {
      const c = existing.data;
      setFirstName(c.firstName);
      setLastName(c.lastName);
      setNotes(c.notes ?? '');
      setContacts(
        c.contacts.length > 0 ? c.contacts : c.phone ? [{ type: 'Телефон', value: c.phone }] : [],
      );
      setTags(c.tags);
      setAccountId(c.accountId ?? '');
      setBirthDate(c.birthDate ?? '');
    }
  }, [editing, existing.data]);

  const mutation = editing ? updateMutation : createMutation;

  function birthDateError(value: string): string {
    if (value === '') return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Некорректная дата';
    if (d.getTime() > Date.now()) return 'Дата в будущем';
    if (d.getFullYear() < 1900) return 'Некорректная дата';
    return '';
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  const errors = {
    firstName: firstName.trim() === '' ? 'Обязательно к заполнению' : '',
    lastName: lastName.trim() === '' ? 'Обязательно к заполнению' : '',
    birthDate: birthDateError(birthDate),
  };
  const hasErrors = errors.firstName !== '' || errors.lastName !== '' || errors.birthDate !== '';

  function addContact() {
    setContacts((prev) => [...prev, { type: 'Телефон', value: '' }]);
  }

  function setContact(index: number, patch: Partial<Contact>) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  function addTag() {
    const t = tagDraft.trim();
    if (t === '' || tags.includes(t)) {
      setTagDraft('');
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagDraft('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const phone = contacts.find((c) => c.type === 'Телефон')?.value.trim() ?? '';
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone === '' ? null : phone,
      notes: notes.trim() === '' ? null : notes.trim(),
      accountId: accountId.trim() === '' ? null : accountId.trim(),
      birthDate: birthDate === '' ? null : birthDate,
      contacts: contacts
        .filter((c) => c.value.trim() !== '')
        .map((c) => ({ type: c.type, value: c.value.trim() })),
      tags,
    };
    if (editing) {
      updateMutation.mutate(payload, {
        onSuccess: () => {
          void navigate(`/clients/${id}`, { replace: true });
        },
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: (client) => {
          void navigate(`/clients/${client.id}`, { replace: true });
        },
      });
    }
  }

  function confirmDelete() {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        void navigate('/clients', { replace: true });
      },
    });
  }

  const title = editing ? 'Клиент' : 'Новый клиент';

  if (editing && existing.isPending) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title={title} back={() => void navigate(-1)} />
        <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <ScreenHeader
        title={title}
        back={() => void navigate(-1)}
        closeIcon={!editing}
        right={
          <button
            type="submit"
            form="client-edit-form"
            disabled={mutation.isPending}
            className="text-[14px] font-semibold text-accent disabled:opacity-50"
          >
            {mutation.isPending ? '…' : 'Сохранить'}
          </button>
        }
      />

      <form
        id="client-edit-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 px-5 pb-8 pt-1"
      >
        {/* Аватар по центру. */}
        <div className="flex justify-center pt-1">
          <Avatar firstName={firstName || 'И'} lastName={lastName || 'Ф'} size={88} />
        </div>

        {/* Подключение клиента (отдельный раздел). */}
        <Section title="Подключение">
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left active:bg-card-elevated"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card-elevated ${
                  accountId.trim() !== '' ? 'text-accent' : 'text-ink-muted'
                }`}
              >
                <svg
                  viewBox="0 -960 960 960"
                  width="20"
                  height="20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M680-160v-120H560v-80h120v-120h80v120h120v80H760v120h-80ZM440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm560-40h-80q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480Z" />
                </svg>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-semibold text-ink">
                  {accountId.trim() !== '' ? 'Клиент подключён' : 'Подключить клиента'}
                </span>
                <span className="truncate text-[12px] text-ink-muted">
                  {accountId.trim() !== ''
                    ? `ID: ${accountId.trim()}`
                    : 'Привязать по коду из приложения клиента'}
                </span>
              </span>
            </span>
            <ChevronRight size={18} className="tile-chevron shrink-0" />
          </button>
        </Section>

        {/* Имя / Фамилия — 2 колонки. */}
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor="firstName" className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Имя</span>
            <input
              id="firstName"
              name="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              aria-invalid={showErrors && errors.firstName !== ''}
              className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent ${
                showErrors && errors.firstName ? 'border-danger' : 'border-line'
              }`}
            />
            {showErrors && errors.firstName && (
              <span className="text-[12px] text-danger">{errors.firstName}</span>
            )}
          </label>
          <label htmlFor="lastName" className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Фамилия</span>
            <input
              id="lastName"
              name="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              aria-invalid={showErrors && errors.lastName !== ''}
              className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent ${
                showErrors && errors.lastName ? 'border-danger' : 'border-line'
              }`}
            />
            {showErrors && errors.lastName && (
              <span className="text-[12px] text-danger">{errors.lastName}</span>
            )}
          </label>
        </div>

        {/* Связь: типизированный список контактов. */}
        <Section title="Связь">
          <div className="flex flex-col gap-2">
            {contacts.map((c, i) => {
              const activeType = CONTACT_TYPES.includes(c.type as (typeof CONTACT_TYPES)[number])
                ? c.type
                : 'Прочее';
              return (
                <div key={i} className="flex flex-col gap-2 rounded-2xl bg-card p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-1 flex-wrap gap-1.5">
                      {CONTACT_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setContact(i, { type: t })}
                          className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                            activeType === t ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeContact(i)}
                      aria-label="Удалить контакт"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted active:bg-card-elevated"
                    >
                      <X size={16} strokeWidth={1.8} />
                    </button>
                  </div>
                  {activeType === 'Прочее' && (
                    <input
                      value={c.type === 'Прочее' ? '' : c.type}
                      onChange={(e) =>
                        setContact(i, { type: e.target.value === '' ? 'Прочее' : e.target.value })
                      }
                      placeholder="Название типа (напр. Email)"
                      aria-label="Название типа контакта"
                      className="w-full rounded-lg border border-line bg-chip px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
                    />
                  )}
                  <input
                    value={c.value}
                    onChange={(e) => setContact(i, { value: e.target.value })}
                    placeholder="Значение"
                    aria-label="Значение контакта"
                    className="w-full rounded-lg border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
                  />
                </div>
              );
            })}
            <button
              type="button"
              onClick={addContact}
              className="w-full rounded-2xl border-2 border-dashed border-line py-3.5 text-sm font-medium text-ink-muted transition-colors active:border-accent"
            >
              Добавить контакт
            </button>
          </div>
        </Section>

        {/* Личное. */}
        <Section title="Личное">
          <label htmlFor="birthDate" className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Дата рождения</span>
            <input
              id="birthDate"
              type="date"
              value={birthDate}
              min="1900-01-01"
              max={todayStr}
              onChange={(e) => setBirthDate(e.target.value)}
              aria-invalid={errors.birthDate !== ''}
              className={`w-full rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent [color-scheme:dark] ${
                errors.birthDate ? 'border-danger' : 'border-line'
              }`}
            />
            {errors.birthDate && (
              <span className="text-[12px] text-danger">{errors.birthDate}</span>
            )}
          </label>
        </Section>

        {/* Заметки. */}
        <Section title="Заметки">
          <textarea
            id="notes"
            name="notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Заметка о клиенте…"
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
          />
        </Section>

        {/* Теги. */}
        <Section title="Теги">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-chip px-3 py-2.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-card-elevated px-2.5 py-1 text-[13px] text-ink"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  aria-label={`Убрать тег ${t}`}
                  className="text-ink-muted"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="+ добавить"
              aria-label="Добавить тег"
              className="min-w-[90px] flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-mutedxl"
            />
          </div>
          <p className="px-1 text-[12px] text-ink-muted">
            Введите тег и нажмите ввод. Теги помогают быстро группировать клиентов.
          </p>
        </Section>

        {mutation.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось сохранить. Проверьте поля и попробуйте снова.
          </p>
        )}

        {editing && (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={deleteMutation.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-card py-3.5 text-[14px] font-semibold text-ink active:bg-card-elevated disabled:opacity-50"
          >
            <Trash2 size={18} strokeWidth={1.8} className="text-danger" /> Удалить клиента
          </button>
        )}
      </form>

      {connectOpen && (
        <ConnectDialog
          value={accountId}
          onApply={(v) => {
            setAccountId(v);
            setConnectOpen(false);
          }}
          onDisconnect={() => {
            setAccountId('');
            setConnectOpen(false);
          }}
          onClose={() => setConnectOpen(false)}
        />
      )}

      {deleteOpen && (
        <DeleteDialog
          clientName={`${firstName} ${lastName}`.trim()}
          pending={deleteMutation.isPending}
          onConfirm={confirmDelete}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}

function DeleteDialog({
  clientName,
  pending,
  onConfirm,
  onClose,
}: {
  clientName: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const matches = draft.trim().toLowerCase() === clientName.toLowerCase() && clientName !== '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Удаление клиента"
      >
        <h2 className="text-[17px] font-bold text-ink">Удалить клиента</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          Действие необратимо. Для подтверждения введите имя клиента:{' '}
          <span className="font-semibold text-ink">{clientName}</span>
        </p>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Имя клиента"
          aria-label="Имя клиента для подтверждения"
          autoFocus
          className="mt-3 w-full rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-card-elevated py-3 text-[14px] font-semibold text-ink active:bg-card"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matches || pending}
            className="flex-1 rounded-xl bg-danger py-3 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {pending ? '…' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectDialog({
  value,
  onApply,
  onDisconnect,
  onClose,
}: {
  value: string;
  onApply: (v: string) => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const connected = value.trim() !== '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Подключить клиента"
      >
        <h2 className="text-[17px] font-semibold text-ink">Подключить клиента</h2>
        <p className="mt-1.5 text-[12px] leading-snug text-ink-muted">
          Личный код из приложения клиента. Нужен, чтобы отправлять тренировки клиенту на
          согласование.
        </p>
        <label htmlFor="accountId" className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">ID клиента</span>
          <input
            id="accountId"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            placeholder="Например, AB12-CD34"
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
          />
        </label>
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-card-elevated py-3 text-[14px] font-semibold text-ink active:bg-card"
          >
            Отмена
          </button>
          {connected && (
            <button
              type="button"
              onClick={onDisconnect}
              className="flex-1 rounded-xl bg-card-elevated py-3 text-[14px] font-semibold text-ink active:bg-card"
            >
              Отключить
            </button>
          )}
          <button
            type="button"
            onClick={() => onApply(draft.trim())}
            className="flex-1 rounded-xl bg-accent py-3 text-[14px] font-semibold text-accent-on active:opacity-90"
          >
            Подключить
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
        {title}
      </h2>
      {children}
    </section>
  );
}
