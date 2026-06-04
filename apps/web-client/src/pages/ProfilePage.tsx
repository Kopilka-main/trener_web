import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Trash2, X } from 'lucide-react';
import type { ClientAccountResponse } from '@trener/shared';
import {
  useClientMe,
  useClientLogout,
  useRemoveMyAvatar,
  useUpdateClientProfile,
  useUploadMyAvatar,
} from '../api/auth';
import { useClientTrainer } from '../api/trainer';
import { compressImage } from '../lib/image';

const CONTACT_TYPES = ['Телефон', 'WhatsApp', 'Telegram', 'MAX', 'Instagram', 'Прочее'] as const;
type Contact = { type: string; value: string };

export function ProfilePage() {
  const me = useClientMe();
  const logout = useClientLogout();
  const update = useUpdateClientProfile();

  return (
    <div className="flex flex-1 flex-col gap-5 px-4 pb-6 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] text-ink">Профиль</h1>
      {me.data ? (
        <ProfileForm account={me.data.account} linked={me.data.link !== null} update={update} />
      ) : (
        <p className="text-sm text-ink-muted">Загрузка…</p>
      )}
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="mt-2 rounded-xl bg-card py-3 text-[14px] font-semibold text-ink active:bg-card-elevated disabled:opacity-60"
      >
        Выйти
      </button>
    </div>
  );
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
}

/** Блок аватара клиента: фото (если есть) либо инициалы + загрузка/удаление.
 * Свой URL фиксированный, поэтому `?v=<id>` — кэш-бастинг при смене файла. */
function AvatarBlock({ account }: { account: ClientAccountResponse }) {
  const upload = useUploadMyAvatar();
  const remove = useRemoveMyAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = upload.isPending || remove.isPending;

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void compressImage(file).then((blob) => {
      upload.mutate(blob);
    });
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
    </div>
  );
}

function ProfileForm({
  account,
  linked,
  update,
}: {
  account: ClientAccountResponse;
  linked: boolean;
  update: ReturnType<typeof useUpdateClientProfile>;
}) {
  const trainer = useClientTrainer();
  const [firstName, setFirstName] = useState(account.firstName);
  const [lastName, setLastName] = useState(account.lastName);
  const [birthDate, setBirthDate] = useState(account.birthDate ?? '');
  const [bio, setBio] = useState(account.bio ?? '');
  const [contacts, setContacts] = useState<Contact[]>(account.contacts);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFirstName(account.firstName);
    setLastName(account.lastName);
    setBirthDate(account.birthDate ?? '');
    setBio(account.bio ?? '');
    setContacts(account.contacts);
  }, [account]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    update.mutate(
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: birthDate === '' ? null : birthDate,
        bio: bio.trim() === '' ? null : bio.trim(),
        contacts: contacts
          .filter((c) => c.value.trim() !== '')
          .map((c) => ({ type: c.type, value: c.value.trim() })),
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <AvatarBlock account={account} />

      {linked ? (
        <Link
          to="/trainer"
          className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 active:bg-card-elevated"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
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
          className="rounded-xl bg-card px-4 py-3 text-[14px] font-semibold text-accent active:bg-card-elevated"
        >
          Подключить тренера
        </Link>
      )}

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
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
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
      {saved && !update.isPending && (
        <p className="text-sm text-ink-muted" role="status">
          Сохранено.
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
