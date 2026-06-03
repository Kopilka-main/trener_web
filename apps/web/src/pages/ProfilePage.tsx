import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Copy, LogOut, Mail, Pencil, Plus, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { TrainerContact, TrainerResponse } from '@trener/shared';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';
import { HoldToDelete } from '../components/HoldToDelete';
import { useLogout, useMe, useUpdateMe } from '../api/auth';
import { useCreateGym, useDeleteGym, useGyms } from '../api/gyms';

const CONTACT_TYPES = ['Телефон', 'WhatsApp', 'Telegram', 'MAX', 'Instagram', 'Прочее'] as const;

/** Профиль тренера: карточка, «о себе», залы, контакты и выход. */
export function ProfilePage() {
  const me = useMe();
  const trainer = me.data?.trainer;
  const [editing, setEditing] = useState(false);

  if (me.isPending) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Профиль" back="/" />
        <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }
  if (!trainer) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Профиль" back="/" />
        <p className="px-5 py-6 text-sm text-ink-muted" role="alert">
          Не удалось загрузить профиль.
        </p>
      </div>
    );
  }

  if (editing) {
    return <ProfileEdit trainer={trainer} onClose={() => setEditing(false)} />;
  }

  const fullName = `${trainer.firstName} ${trainer.lastName}`.trim();

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title="Профиль"
        back="/"
        right={
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Редактировать профиль"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <Pencil size={17} strokeWidth={1.9} />
          </button>
        }
      />

      <div className="flex flex-1 flex-col gap-5 px-4 pb-10 pt-1">
        {/* Карточка тренера */}
        <div className="flex items-center gap-3 rounded-3xl bg-card p-4">
          <Avatar firstName={trainer.firstName} lastName={trainer.lastName} size={64} />
          <div className="min-w-0">
            <div className="text-[19px] font-bold leading-tight text-ink">{fullName}</div>
            {trainer.title && (
              <div className="mt-0.5 truncate text-[13px] text-ink-muted">{trainer.title}</div>
            )}
            <div className="truncate text-[12px] text-ink-mutedxl">{trainer.email}</div>
          </div>
        </div>

        {trainer.bio && (
          <Section title="О себе">
            <div className="rounded-2xl bg-card p-3.5 text-[13px] leading-relaxed text-ink">
              {trainer.bio}
            </div>
          </Section>
        )}

        <GymsSection />

        <Section title="Контакты">
          <div className="flex flex-col gap-1.5">
            <a
              href={`mailto:${trainer.email}`}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3"
            >
              <Mail size={16} className="shrink-0 text-ink-muted" />
              <span className="shrink-0 text-[13px] text-ink-muted">Email</span>
              <span className="ml-auto min-w-0 truncate text-[14px] font-semibold text-ink">
                {trainer.email}
              </span>
              <ChevronRight size={15} className="shrink-0 text-ink-mutedxl" />
            </a>
            {trainer.contacts.map((c, i) => (
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
        </Section>

        <IdRow id={trainer.id} />

        <LogoutButton />
      </div>
    </div>
  );
}

/** Строка с ID пользователя: копирование + кнопка показа QR-кода. */
function IdRow({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  return (
    <Section title="ID пользователя">
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(id);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[13px] text-ink">
            {id}
          </span>
          {copied ? (
            <Check size={16} className="shrink-0 text-accent" />
          ) : (
            <Copy size={16} className="shrink-0 text-ink-muted" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-card px-4 py-3 text-[13px] font-semibold text-ink active:bg-card-elevated"
        >
          <QrCode size={16} className="text-ink-muted" />
          {showQr ? 'Скрыть QR' : 'Показать QR'}
        </button>

        {showQr && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-5">
            <div className="rounded-2xl bg-white p-4">
              <QRCodeSVG value={id} size={200} level="M" marginSize={0} />
            </div>
            <p className="text-center text-[12px] text-ink-muted">
              Отсканируйте, чтобы получить ID тренера
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}

function LogoutButton() {
  const navigate = useNavigate();
  const logout = useLogout();
  return (
    <button
      type="button"
      onClick={() =>
        logout.mutate(undefined, { onSuccess: () => void navigate('/login', { replace: true }) })
      }
      disabled={logout.isPending}
      className="flex w-full items-center justify-center gap-2 py-2 text-[14px] font-semibold text-danger disabled:opacity-50"
    >
      <LogOut size={16} /> Выйти
    </button>
  );
}

// ─── Залы ─────────────────────────────────────────────────────────────────────

function GymsSection() {
  const gyms = useGyms();
  const create = useCreateGym();
  const remove = useDeleteGym();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  function add() {
    const value = name.trim();
    if (value === '') return;
    create.mutate(
      { name: value },
      {
        onSuccess: () => {
          setName('');
          setAdding(false);
        },
      },
    );
  }

  const items = gyms.data ?? [];

  return (
    <Section title="Залы">
      <div className="flex flex-col gap-1.5">
        {items.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {items.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{g.name}</span>
                <HoldToDelete
                  icon="trash"
                  onDelete={() => remove.mutate(g.id)}
                  label="Удерживайте, чтобы удалить зал"
                />
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-2.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
                if (e.key === 'Escape') {
                  setName('');
                  setAdding(false);
                }
              }}
              placeholder="World Class, СССР…"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-mutedxl"
            />
            <button
              type="button"
              onClick={add}
              disabled={name.trim() === '' || create.isPending}
              className="shrink-0 rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-accent-on disabled:opacity-40"
            >
              Готово
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-[13px] font-semibold text-ink-muted active:bg-card"
          >
            <Plus size={15} /> Добавить зал
          </button>
        )}
      </div>
    </Section>
  );
}

// ─── Общие ────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.08em] text-ink-mutedxl">
        {title}
      </h3>
      {children}
    </section>
  );
}

// ─── Редактирование профиля ───────────────────────────────────────────────────

function ProfileEdit({ trainer, onClose }: { trainer: TrainerResponse; onClose: () => void }) {
  const update = useUpdateMe();
  const [firstName, setFirstName] = useState(trainer.firstName);
  const [lastName, setLastName] = useState(trainer.lastName);
  const [title, setTitle] = useState(trainer.title ?? '');
  const [bio, setBio] = useState(trainer.bio ?? '');
  const [contacts, setContacts] = useState<TrainerContact[]>(trainer.contacts);
  const [error, setError] = useState<string | null>(null);

  // Если данные тренера обновились извне, подхватываем (на случай рефетча).
  useEffect(() => {
    setFirstName(trainer.firstName);
    setLastName(trainer.lastName);
  }, [trainer.firstName, trainer.lastName]);

  function addContact() {
    setContacts((prev) => [...prev, { type: 'Телефон', value: '' }]);
  }
  function setContact(index: number, patch: Partial<TrainerContact>) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    setError(null);
    if (firstName.trim() === '' || lastName.trim() === '') {
      setError('Имя и фамилия обязательны.');
      return;
    }
    // Отбрасываем пустые контакты, тримим значения.
    const cleanContacts = contacts
      .map((c) => ({ type: c.type.trim() || 'Прочее', value: c.value.trim() }))
      .filter((c) => c.value !== '');
    update.mutate(
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        title: title.trim() === '' ? null : title.trim(),
        bio: bio.trim() === '' ? null : bio.trim(),
        contacts: cleanContacts,
      },
      { onSuccess: onClose, onError: () => setError('Не удалось сохранить. Попробуйте снова.') },
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title="Редактировать"
        back={onClose}
        right={
          <button
            type="button"
            onClick={save}
            disabled={update.isPending}
            className="px-1 text-[14px] font-semibold text-ink disabled:opacity-40"
          >
            {update.isPending ? '…' : 'Сохранить'}
          </button>
        }
      />

      <div className="flex flex-1 flex-col gap-4 px-4 pb-10 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <EditField label="Имя" value={firstName} onChange={setFirstName} placeholder="Имя" />
          <EditField
            label="Фамилия"
            value={lastName}
            onChange={setLastName}
            placeholder="Фамилия"
          />
        </div>
        <EditField
          label="Должность"
          value={title}
          onChange={setTitle}
          placeholder="Напр. персональный тренер"
        />
        <label className="flex flex-col gap-1.5">
          <span className={KICKER}>О себе</span>
          <textarea
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Опыт, подход, специализация…"
            className="resize-none rounded-xl border border-line bg-chip px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
          />
        </label>

        {/* Связь: типизированный список контактов (как у клиентов). */}
        <div className="flex flex-col gap-2">
          <span className={KICKER}>Связь</span>
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

        {error && (
          <p className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={KICKER}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-line bg-chip px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
      />
    </label>
  );
}

const KICKER =
  'font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.08em] text-ink-mutedxl';
