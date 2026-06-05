import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Mail, Moon, Pencil, Plus, Sun, Trash2, X } from 'lucide-react';
import type { ClientAccountResponse } from '@trener/shared';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import {
  useClientMe,
  useClientLogout,
  useRemoveMyAvatar,
  useUpdateClientProfile,
  useUploadMyAvatar,
} from '../api/auth';
import { useClientTrainer } from '../api/trainer';
import { AvatarCropper } from '../components/AvatarCropper';
import { NotificationsToggle } from '../components/NotificationsToggle';

const CONTACT_TYPES = ['Телефон', 'WhatsApp', 'Telegram', 'MAX', 'Instagram', 'Прочее'] as const;
type Contact = { type: string; value: string };

export function ProfilePage() {
  const me = useClientMe();
  const logout = useClientLogout();
  const update = useUpdateClientProfile();
  const [editing, setEditing] = useState(false);

  if (!me.data) {
    return (
      <div className="flex flex-1 flex-col gap-5 px-2 pb-6 pt-5">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] text-ink">Профиль</h1>
        <p className="text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  const account = me.data.account;
  const linked = me.data.link !== null;

  if (editing) {
    return <ProfileEdit account={account} update={update} onClose={() => setEditing(false)} />;
  }

  return (
    <ProfileView
      account={account}
      linked={linked}
      onEdit={() => setEditing(true)}
      onLogout={() => logout.mutate()}
      logoutPending={logout.isPending}
    />
  );
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
}

// Дата рождения вводится вручную как ДД.ММ.ГГГГ; хранится как ISO YYYY-MM-DD.
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
function maskDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('.');
}
function displayToIso(display: string): string | null {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(yyyy);
  if (y < 1900 || y > 2100) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Просмотр профиля ──────────────────────────────────────────────────────────

/** Аватар клиента в режиме просмотра: фото (если есть) либо инициалы, без загрузки. */
function AvatarView({ account }: { account: ClientAccountResponse }) {
  const src = account.avatarFileId ? `/api/client/auth/me/avatar?v=${account.avatarFileId}` : null;
  return src ? (
    <img
      src={src}
      alt={`${account.firstName} ${account.lastName}`.trim()}
      className="h-16 w-16 shrink-0 rounded-full bg-chip object-cover"
    />
  ) : (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-chip font-[family-name:var(--font-display)] text-[22px] text-ink">
      {initials(account.firstName, account.lastName)}
    </span>
  );
}

function ProfileView({
  account,
  linked,
  onEdit,
  onLogout,
  logoutPending,
}: {
  account: ClientAccountResponse;
  linked: boolean;
  onEdit: () => void;
  onLogout: () => void;
  logoutPending: boolean;
}) {
  const trainer = useClientTrainer();
  const fullName = `${account.firstName} ${account.lastName}`.trim();

  return (
    <div className="flex flex-1 flex-col gap-5 px-2 pb-6 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] text-ink">Профиль</h1>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Редактировать профиль"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
        >
          <Pencil size={17} strokeWidth={1.9} />
        </button>
      </div>

      {/* Карточка клиента */}
      <div className="flex items-center gap-3 rounded-3xl bg-card p-4">
        <AvatarView account={account} />
        <div className="min-w-0">
          <div className="text-[19px] font-bold leading-tight text-ink">{fullName}</div>
          <div className="truncate text-[12px] text-ink-mutedxl">{account.email}</div>
          {account.birthDate && (
            <div className="truncate text-[12px] text-ink-mutedxl">
              Дата рождения: {isoToDisplay(account.birthDate)}
            </div>
          )}
        </div>
      </div>

      {/* Тренер */}
      {linked ? (
        <Link
          to="/trainer"
          className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 active:bg-card-elevated"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-elevated">
            {trainer.data?.avatarFileId ? (
              <img
                src={`/api/client/trainer/avatar?v=${trainer.data.avatarFileId}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[15px] font-bold text-ink">
                {trainer.data ? initials(trainer.data.firstName, trainer.data.lastName) : '—'}
              </span>
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
              Ваш тренер
            </span>
            <span className="truncate text-[15px] font-semibold text-ink">
              {trainer.data ? `${trainer.data.firstName} ${trainer.data.lastName}` : 'Загрузка…'}
            </span>
            {trainer.data?.title && (
              <span className="truncate text-[13px] text-ink-muted">{trainer.data.title}</span>
            )}
          </span>
          <ChevronRight size={18} className="shrink-0 text-ink-mutedxl" />
        </Link>
      ) : (
        <Link
          to="/connect"
          className="rounded-xl bg-card px-4 py-3 text-[14px] font-semibold text-accent-text active:bg-card-elevated"
        >
          Подключить тренера
        </Link>
      )}

      {/* Контакты */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">Контакты</span>
        <a
          href={`mailto:${account.email}`}
          className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3"
        >
          <Mail size={16} className="shrink-0 text-ink-muted" />
          <span className="shrink-0 text-[13px] text-ink-muted">Email</span>
          <span className="ml-auto min-w-0 truncate text-[14px] font-semibold text-ink">
            {account.email}
          </span>
          <ChevronRight size={15} className="shrink-0 text-ink-mutedxl" />
        </a>
        {account.contacts.map((c, i) => (
          <div
            key={`${c.type}-${String(i)}`}
            className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3"
          >
            <span className="shrink-0 text-[13px] text-ink-muted">{c.type}</span>
            <span className="ml-auto min-w-0 truncate text-[14px] font-semibold text-ink">
              {c.value}
            </span>
          </div>
        ))}
      </div>

      {/* О себе */}
      {account.bio && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">О себе / цели</span>
          <div className="rounded-2xl bg-card p-3.5 text-[14px] leading-relaxed text-ink">
            {account.bio}
          </div>
        </div>
      )}

      {/* Уведомления */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">Уведомления</span>
        <NotificationsToggle />
      </div>

      {/* Тема оформления */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">Тема</span>
        <ThemeToggle />
      </div>

      <button
        type="button"
        onClick={onLogout}
        disabled={logoutPending}
        className="mt-2 rounded-xl bg-card py-3 text-[14px] font-semibold text-ink active:bg-card-elevated disabled:opacity-60"
      >
        Выйти
      </button>
    </div>
  );
}

/** Переключатель светлой/тёмной темы. */
function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(() => getTheme());
  const choose = (t: Theme) => {
    setTheme(t);
    setLocal(t);
  };
  return (
    <div className="flex gap-2 rounded-2xl bg-card p-1.5">
      <ThemeOption
        label="Светлая"
        active={theme === 'light'}
        onClick={() => choose('light')}
        Icon={Sun}
      />
      <ThemeOption
        label="Тёмная"
        active={theme === 'dark'}
        onClick={() => choose('dark')}
        Icon={Moon}
      />
    </div>
  );
}

function ThemeOption({
  label,
  active,
  onClick,
  Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  Icon: typeof Sun;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-semibold transition-colors ${
        active ? 'bg-accent text-accent-on' : 'text-ink-muted active:bg-card-elevated'
      }`}
    >
      <Icon size={16} strokeWidth={2} />
      {label}
    </button>
  );
}

// ─── Редактирование профиля ─────────────────────────────────────────────────────

/** Блок аватара клиента в режиме редактирования: фото/инициалы + загрузка/удаление.
 * Свой URL фиксированный, поэтому `?v=<id>` — кэш-бастинг при смене файла. */
function AvatarBlock({ account }: { account: ClientAccountResponse }) {
  const upload = useUploadMyAvatar();
  const remove = useRemoveMyAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const busy = upload.isPending || remove.isPending;

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setPending(file);
  }

  const src = account.avatarFileId ? `/api/client/auth/me/avatar?v=${account.avatarFileId}` : null;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Загрузить фото"
        className="rounded-full disabled:opacity-50"
      >
        {src ? (
          <img
            src={src}
            alt={`${account.firstName} ${account.lastName}`.trim()}
            className="h-20 w-20 rounded-full bg-chip object-cover"
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-chip font-[family-name:var(--font-display)] text-[26px] text-ink">
            {initials(account.firstName, account.lastName)}
          </span>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      {account.avatarFileId && (
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={busy}
          aria-label="Удалить фото"
          className="flex items-center gap-1 text-[12px] font-medium text-ink-muted disabled:opacity-50"
        >
          <Trash2 size={13} strokeWidth={1.9} /> Удалить
        </button>
      )}
      {pending && (
        <AvatarCropper
          file={pending}
          busy={upload.isPending}
          onCancel={() => setPending(null)}
          onDone={(blob) => upload.mutate(blob, { onSuccess: () => setPending(null) })}
        />
      )}
    </div>
  );
}

function ProfileEdit({
  account,
  update,
  onClose,
}: {
  account: ClientAccountResponse;
  update: ReturnType<typeof useUpdateClientProfile>;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(account.firstName);
  const [lastName, setLastName] = useState(account.lastName);
  // birthDate хранится в state как отображаемая строка ДД.ММ.ГГГГ.
  const [birthDate, setBirthDate] = useState(isoToDisplay(account.birthDate ?? ''));
  const [bio, setBio] = useState(account.bio ?? '');
  const [contacts, setContacts] = useState<Contact[]>(account.contacts);

  useEffect(() => {
    setFirstName(account.firstName);
    setLastName(account.lastName);
    setBirthDate(isoToDisplay(account.birthDate ?? ''));
    setBio(account.bio ?? '');
    setContacts(account.contacts);
  }, [account]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    update.mutate(
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: birthDate.trim() === '' ? null : displayToIso(birthDate),
        bio: bio.trim() === '' ? null : bio.trim(),
        contacts: contacts
          .filter((c) => c.value.trim() !== '')
          .map((c) => ({ type: c.type, value: c.value.trim() })),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 px-2 pb-6 pt-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Назад"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
        >
          <ChevronLeft size={22} strokeWidth={1.9} />
        </button>
        <h1 className="font-[family-name:var(--font-display)] text-[22px] text-ink">
          Редактировать
        </h1>
        <span className="h-9 w-9" />
      </div>

      <AvatarBlock account={account} />

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Имя</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Фамилия</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">Дата рождения</span>
        <input
          inputMode="numeric"
          value={birthDate}
          onChange={(e) => setBirthDate(maskDate(e.target.value))}
          placeholder="ДД.ММ.ГГГГ"
          maxLength={10}
          className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-muted">Контакты</span>
        {contacts.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={c.type}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)),
                )
              }
              className="rounded-xl border border-line bg-chip px-2 py-2.5 text-sm text-ink outline-none focus:border-accent"
            >
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={c.value}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                )
              }
              className="min-w-0 flex-1 rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              aria-label="Удалить контакт"
              onClick={() => setContacts((prev) => prev.filter((_, j) => j !== i))}
              className="shrink-0 rounded-xl bg-card p-2.5 text-ink-muted active:bg-card-elevated"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setContacts((prev) => [...prev, { type: 'Телефон', value: '' }])}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-[13px] font-semibold text-ink-muted active:border-accent"
        >
          <Plus size={16} /> Добавить контакт
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">О себе / цели</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
        />
      </label>

      {update.isError && (
        <p className="text-sm text-ink-muted" role="alert">
          Не удалось сохранить. Попробуйте снова.
        </p>
      )}

      <button
        type="submit"
        disabled={update.isPending}
        className="rounded-xl bg-accent py-3 font-semibold text-accent-on active:opacity-90 disabled:opacity-60"
      >
        {update.isPending ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  );
}
