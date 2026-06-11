import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AtSign,
  Camera,
  Check,
  ChevronRight,
  Download,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  Trash2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Contact } from '@trener/shared';
import {
  getAccountProfile,
  useClient,
  useCreateClient,
  useDeleteClient,
  useRemoveClientAvatar,
  useUpdateClient,
  useUploadClientAvatar,
  verifyConnectCode,
} from '../api/clients';
import { ApiError } from '../api/client';
import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { QrScanner } from '../components/QrScanner';

interface ClientEditPageProps {
  mode: 'create' | 'edit';
}

// Контакты добавляются отдельными строками «+ добавить …» с ФИКСИРОВАННЫМ типом —
// в самом поле выбора типа нет (телефон = только телефон и т.д.).
const CONTACT_ADD = [
  { type: 'Телефон', label: 'добавить телефон' },
  { type: 'Email', label: 'добавить e-mail' },
  { type: 'Telegram', label: 'добавить Telegram' },
  { type: 'WhatsApp', label: 'добавить WhatsApp' },
  { type: 'MAX', label: 'добавить MAX' },
  { type: 'Instagram', label: 'добавить Instagram' },
  { type: 'ВКонтакте', label: 'добавить ВКонтакте' },
] as const;

function contactIcon(type: string): LucideIcon {
  if (type === 'Телефон' || type === 'WhatsApp') return Phone;
  if (type === 'Email') return Mail;
  if (type === 'Instagram' || type === 'ВКонтакте') return AtSign;
  return MessageCircle;
}
function contactPlaceholder(type: string): string {
  switch (type) {
    case 'Телефон':
    case 'WhatsApp':
      return '+7 900 000-00-00';
    case 'Email':
      return 'name@mail.ru';
    case 'Telegram':
    case 'Instagram':
      return '@username';
    case 'ВКонтакте':
      return 'vk.com/id…';
    default:
      return 'Значение';
  }
}
function contactInputMode(type: string): 'tel' | 'email' | 'text' {
  if (type === 'Телефон' || type === 'WhatsApp') return 'tel';
  if (type === 'Email') return 'email';
  return 'text';
}

/** ISO «1990-06-11» → отображение «11.06.1990». Пусто → ''. */
function isoToBirthDisplay(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** Отображение «11.06.1990» → ISO «1990-06-11». Неполный ввод → ''. */
function birthDisplayToIso(display: string): string {
  const d = display.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : '';
}

/** Авто-формат ввода даты: цифры → ДД.ММ.ГГГГ (точки расставляются сами). */
function formatBirthInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += `.${d.slice(2, 4)}`;
  if (d.length > 4) out += `.${d.slice(4, 8)}`;
  return out;
}

/** Проверка введённой даты рождения (текст ДД.ММ.ГГГГ). '' = ок (поле необязательное). */
function birthDateError(display: string): string {
  if (display.trim() === '') return '';
  const d = display.replace(/\D/g, '');
  if (d.length !== 8) return 'Дата в формате ДД.ММ.ГГГГ';
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const year = Number(d.slice(4, 8));
  const nowYear = new Date().getFullYear();
  if (month < 1 || month > 12) return 'Некорректный месяц';
  if (year < 1900 || year > nowYear) return 'Некорректный год';
  // Реальный день месяца (учитывает високосные годы): new Date(year, month, 0) = последний день.
  const lastDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > lastDay) return 'Некорректный день';
  if (new Date(year, month - 1, day).getTime() > Date.now()) return 'Дата в будущем';
  return '';
}

export function ClientEditPage({ mode }: ClientEditPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const editing = mode === 'edit';

  const existing = useClient(editing ? id : '');
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient(id);
  const deleteMutation = useDeleteClient();
  const uploadAvatar = useUploadClientAvatar(id);
  const removeAvatar = useRemoveClientAvatar(id);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [notes, setNotes] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [accountId, setAccountId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

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
      setBirthDate(isoToBirthDisplay(c.birthDate));
      setIsOnline(c.isOnline);
    }
  }, [editing, existing.data]);

  const mutation = editing ? updateMutation : createMutation;

  const errors = {
    firstName: firstName.trim() === '' ? 'Обязательно к заполнению' : '',
    birthDate: birthDateError(birthDate),
  };
  const hasErrors = errors.firstName !== '' || errors.birthDate !== '';

  function addContact(type = 'Телефон') {
    setContacts((prev) => [...prev, { type, value: '' }]);
  }

  function setContact(index: number, patch: Partial<Contact>) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  // «Получить данные»: тянем профиль подключённого аккаунта и заполняем поля.
  async function fillFromAccount() {
    const id = accountId.trim();
    if (id === '') return;
    setProfileError(null);
    setFetchingProfile(true);
    try {
      const p = await getAccountProfile(id);
      if (p.firstName) setFirstName(p.firstName);
      if (p.lastName) setLastName(p.lastName);
      if (p.birthDate) setBirthDate(isoToBirthDisplay(p.birthDate));
      // Контакты: добавляем недостающие из аккаунта (по паре тип+значение), не дублируя.
      const incoming = [...p.contacts];
      setContacts((prev) => {
        const seen = new Set(prev.map((c) => `${c.type}|${c.value}`));
        const merged = [...prev];
        for (const c of incoming) {
          const key = `${c.type}|${c.value}`;
          if (c.value.trim() !== '' && !seen.has(key)) {
            seen.add(key);
            merged.push(c);
          }
        }
        return merged;
      });
    } catch {
      setProfileError('Не удалось получить данные аккаунта.');
    } finally {
      setFetchingProfile(false);
    }
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
      birthDate: birthDisplayToIso(birthDate) || null,
      contacts: contacts
        .filter((c) => c.value.trim() !== '')
        .map((c) => ({ type: c.type, value: c.value.trim() })),
      tags,
      isOnline,
    };
    if (editing) {
      updateMutation.mutate(payload, {
        onSuccess: () => {
          // Возврат туда же, откуда вошли в правку (как крестик ✕) — обычно карточка клиента.
          void navigate(-1);
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

  const avatarFileId = existing.data?.avatarFileId ?? null;
  const avatarBusy = uploadAvatar.isPending || removeAvatar.isPending;

  function onAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // позволяем выбрать тот же файл повторно
    if (!file) return;
    uploadAvatar.mutate(file);
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
        <p className="px-2 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Шапка в стиле iOS: круглые «отмена» (X) и «сохранить» (✓). */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-bg/95 px-3 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          aria-label="Отмена"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-ink active:bg-card-elevated"
        >
          <X size={18} strokeWidth={2} />
        </button>
        <h1 className="text-[16px] font-semibold text-ink">{title}</h1>
        <button
          type="submit"
          form="client-edit-form"
          disabled={mutation.isPending}
          aria-label="Сохранить"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-on active:opacity-90 disabled:opacity-50"
        >
          <Check size={18} strokeWidth={2.5} />
        </button>
      </header>

      <form
        id="client-edit-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 px-2 pb-8 pt-1"
      >
        {/* Аватар по центру. В режиме edit — кликабельный (загрузка фото). */}
        <div className="flex flex-col items-center gap-2 pt-1">
          {editing ? (
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy}
              aria-label="Изменить фото"
              className="relative rounded-full disabled:opacity-50"
            >
              <Avatar
                firstName={firstName || 'И'}
                lastName={lastName || 'Ф'}
                size={96}
                src={avatarFileId ? `/api/files/${avatarFileId}` : null}
              />
              <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-on">
                <Camera size={15} strokeWidth={2} />
              </span>
            </button>
          ) : (
            <Avatar firstName={firstName || 'И'} lastName={lastName || 'Ф'} size={96} />
          )}

          {editing && (
            <>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarPicked}
              />
              <div className="flex items-center gap-3 text-[13px]">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="font-semibold text-accent-text disabled:opacity-50"
                >
                  {uploadAvatar.isPending ? 'Загрузка…' : 'Изменить фото'}
                </button>
                {avatarFileId && (
                  <button
                    type="button"
                    onClick={() => removeAvatar.mutate()}
                    disabled={avatarBusy}
                    className="font-semibold text-ink-muted disabled:opacity-50"
                  >
                    Удалить фото
                  </button>
                )}
              </div>
              {(uploadAvatar.isError || removeAvatar.isError) && (
                <p className="text-[12px] text-ink-muted" role="alert">
                  Не удалось обновить фото. Попробуйте снова.
                </p>
              )}
            </>
          )}
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
                  accountId.trim() !== '' ? 'text-accent-text' : 'text-ink-muted'
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
                  {accountId.trim() !== '' ? 'Код привязки указан' : 'Подключить клиента'}
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

          {accountId.trim() !== '' && (
            <>
              <button
                type="button"
                onClick={() => void fillFromAccount()}
                disabled={fetchingProfile}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/50 py-3 text-[13px] font-semibold text-accent-text active:bg-accent/10 disabled:opacity-50"
              >
                <Download size={15} strokeWidth={2} />
                {fetchingProfile ? 'Получаем…' : 'Получить данные из профиля клиента'}
              </button>
              {profileError && <span className="text-[12px] text-danger">{profileError}</span>}
            </>
          )}
        </Section>

        {/* Имя / Фамилия — сгруппированная белая карточка с разделителем (как в iOS). */}
        <div className="overflow-hidden rounded-2xl bg-card">
          <input
            id="firstName"
            name="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Имя"
            aria-label="Имя"
            aria-invalid={showErrors && errors.firstName !== ''}
            className="w-full bg-transparent px-4 py-3.5 text-[16px] text-ink outline-none placeholder:text-ink-mutedxl"
          />
          <div className="mx-4 h-px bg-line" />
          <input
            id="lastName"
            name="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Фамилия"
            aria-label="Фамилия"
            className="w-full bg-transparent px-4 py-3.5 text-[16px] text-ink outline-none placeholder:text-ink-mutedxl"
          />
        </div>
        {showErrors && errors.firstName && (
          <p className="-mt-2 px-1 text-[12px] text-danger">{errors.firstName}</p>
        )}

        {/* Формат работы с клиентом. */}
        <Section title="Формат">
          <div className="flex gap-2">
            {[
              { value: false, label: 'Спортзал' },
              { value: true, label: 'Онлайн' },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setIsOnline(opt.value)}
                className={`flex-1 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-colors ${
                  isOnline === opt.value ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Связь: показываем только ДОБАВЛЕННЫЕ контакты — чистой строкой
            (иконка + тип + значение), тип фиксирован. Добавление — строками ниже. */}
        <Section title="Связь">
          <div className="flex flex-col gap-2">
            {contacts.map((c, i) => {
              const Icon = contactIcon(c.type);
              return (
                <div key={i} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-ink-muted">
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[12px] text-ink-muted">{c.type}</span>
                    <input
                      value={c.value}
                      onChange={(e) => setContact(i, { value: e.target.value })}
                      placeholder={contactPlaceholder(c.type)}
                      inputMode={contactInputMode(c.type)}
                      aria-label={c.type}
                      autoFocus={c.value === ''}
                      className="w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-mutedxl"
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => removeContact(i)}
                    aria-label="Удалить контакт"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted active:bg-card-elevated"
                  >
                    <X size={16} strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}
            {CONTACT_ADD.map(({ type, label }) => (
              <AddRow key={type} label={label} onClick={() => addContact(type)} />
            ))}
          </div>
        </Section>

        {/* Личное. */}
        <Section title="Личное">
          <div className="rounded-2xl bg-card px-4 py-2">
            <label htmlFor="birthDate" className="flex flex-col">
              <span className="text-[12px] text-ink-muted">Дата рождения</span>
              <input
                id="birthDate"
                type="text"
                inputMode="numeric"
                value={birthDate}
                onChange={(e) => setBirthDate(formatBirthInput(e.target.value))}
                placeholder="ДД.ММ.ГГГГ"
                maxLength={10}
                aria-invalid={errors.birthDate !== ''}
                className="w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-mutedxl"
              />
            </label>
          </div>
          {errors.birthDate && <p className="px-1 text-[12px] text-danger">{errors.birthDate}</p>}
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
            className="rounded-2xl bg-card px-4 py-3 text-[16px] text-ink outline-none placeholder:text-ink-mutedxl"
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
            {mutation.error instanceof ApiError &&
            mutation.error.code === 'CLIENT_ACCOUNT_NOT_FOUND'
              ? 'Неверный код подключения: клиентский аккаунт не найден. Проверьте код или отсканируйте QR.'
              : 'Не удалось сохранить. Проверьте поля и попробуйте снова.'}
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
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const connected = value.trim() !== '';

  // Проверяем код на сервере ПЕРЕД применением: нет такого аккаунта → ошибка, диалог не закрываем.
  async function apply() {
    const code = draft.trim();
    if (code === '') return;
    setChecking(true);
    setError('');
    try {
      const exists = await verifyConnectCode(code);
      if (!exists) {
        setError('Клиент с таким кодом не найден. Проверьте код или отсканируйте QR.');
        return;
      }
      onApply(code);
    } catch {
      setError('Не удалось проверить код. Попробуйте снова.');
    } finally {
      setChecking(false);
    }
  }

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
            onChange={(e) => {
              setDraft(e.target.value);
              setError('');
            }}
            autoFocus
            placeholder="Например, AB12-CD34"
            aria-invalid={error !== ''}
            className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent ${
              error !== '' ? 'border-danger' : 'border-line'
            }`}
          />
          {error !== '' && <span className="text-[12px] text-ink-muted">{error}</span>}
        </label>

        <button
          type="button"
          onClick={() => setScanning(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2.5 text-[13px] font-semibold text-ink-muted active:border-accent"
        >
          <QrCode size={16} /> Сканировать QR
        </button>

        {scanning && (
          <QrScanner
            onResult={(text) => {
              setDraft(text);
              setError('');
              setScanning(false);
            }}
            onClose={() => setScanning(false)}
          />
        )}
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
            onClick={() => void apply()}
            disabled={checking || draft.trim() === ''}
            className="flex-1 rounded-xl bg-accent py-3 text-[14px] font-semibold text-accent-on active:opacity-90 disabled:opacity-50"
          >
            {checking ? 'Проверка…' : 'Подключить'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Строка «+ добавить …» в стиле iOS-контактов: зелёный круглый плюс + подпись. */
function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left active:bg-card-elevated"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-on">
        <Plus size={18} strokeWidth={2.5} />
      </span>
      <span className="text-[15px] text-ink">{label}</span>
    </button>
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
