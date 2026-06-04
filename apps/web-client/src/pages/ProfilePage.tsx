import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import type { ClientAccountResponse } from '@trener/shared';
import { useClientMe, useClientLogout, useUpdateClientProfile } from '../api/auth';
import { useClientTrainer } from '../api/trainer';

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
      {linked ? (
        <section className="flex flex-col gap-1 rounded-xl bg-card px-4 py-3">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
            Ваш тренер
          </span>
          {trainer.data ? (
            <>
              <span className="text-[15px] font-semibold text-ink">
                {trainer.data.firstName} {trainer.data.lastName}
              </span>
              {trainer.data.title && (
                <span className="text-[13px] text-ink-muted">{trainer.data.title}</span>
              )}
              {trainer.data.bio && (
                <span className="mt-1 text-[13px] text-ink-muted">{trainer.data.bio}</span>
              )}
              {trainer.data.contacts.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {trainer.data.contacts.map((c, i) => (
                    <li key={i} className="text-[13px] text-ink-muted">
                      {c.type}: {c.value}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <span className="text-[13px] text-ink-muted">Загрузка…</span>
          )}
        </section>
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
