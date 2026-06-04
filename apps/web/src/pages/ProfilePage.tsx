import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  Copy,
  LogOut,
  Mail,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { TrainerContact, TrainerResponse } from '@trener/shared';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';
import { HoldToDelete } from '../components/HoldToDelete';
import { useLogout, useMe, useRemoveMyAvatar, useUpdateMe, useUploadMyAvatar } from '../api/auth';
import { useCreateGym, useDeleteGym, useGyms } from '../api/gyms';
import { AvatarCropper } from '../components/AvatarCropper';

const CONTACT_TYPES = ['Телефон', 'WhatsApp', 'Telegram', 'MAX', 'Instagram', 'Прочее'] as const;

// Дата рождения: ручной ввод ДД.ММ.ГГГГ ↔ хранение ISO YYYY-MM-DD.
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
function maskDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('.');
}
function displayToIso(display: string): string | null {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const y = Number(yyyy);
  if (y < 1900 || y > 2100) return null;
  const dt = new Date(y, Number(mm) - 1, Number(dd));
  if (dt.getFullYear() !== y || dt.getMonth() !== Number(mm) - 1 || dt.getDate() !== Number(dd)) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

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
        {/* Карточка тренера (просмотр — аватар без загрузки). */}
        <div className="flex items-center gap-3 rounded-3xl bg-card p-4">
          <Avatar
            firstName={trainer.firstName}
            lastName={trainer.lastName}
            size={64}
            src={
              trainer.avatarFileId
                ? `/api/files/${trainer.avatarFileId}?v=${trainer.avatarFileId}`
                : null
            }
          />
          <div className="min-w-0">
            <div className="text-[19px] font-bold leading-tight text-ink">{fullName}</div>
            <div className="truncate text-[12px] text-ink-mutedxl">{trainer.email}</div>
            {trainer.birthDate && (
              <div className="truncate text-[12px] text-ink-mutedxl">
                Дата рождения: {isoToDisplay(trainer.birthDate)}
              </div>
            )}
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

/** Аватар тренера в карточке профиля: фото (если есть) или инициалы + загрузка/удаление.
 * `?v=<id>` в src — кэш-бастинг, чтобы <img> обновился после смены файла. */
function AvatarEditor({ trainer }: { trainer: TrainerResponse }) {
  const upload = useUploadMyAvatar();
  const remove = useRemoveMyAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const busy = upload.isPending || remove.isPending;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setPending(file);
  }

  const src = trainer.avatarFileId
    ? `/api/files/${trainer.avatarFileId}?v=${trainer.avatarFileId}`
    : null;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Загрузить фото"
        className="rounded-full disabled:opacity-50"
      >
        <Avatar firstName={trainer.firstName} lastName={trainer.lastName} size={64} src={src} />
      </button>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="text-[12px] font-semibold text-accent disabled:opacity-50"
      >
        {busy ? 'Загрузка…' : 'Изменить фото'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      {trainer.avatarFileId && (
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={busy}
          aria-label="Удалить фото"
          className="flex items-center gap-1 text-[11px] font-medium text-ink-muted disabled:opacity-50"
        >
          <Trash2 size={12} strokeWidth={1.9} /> Удалить
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
  const [bio, setBio] = useState(trainer.bio ?? '');
  const [birthDate, setBirthDate] = useState(isoToDisplay(trainer.birthDate ?? ''));
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
        bio: bio.trim() === '' ? null : bio.trim(),
        birthDate: birthDate.trim() === '' ? null : displayToIso(birthDate),
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
            className="px-1 text-[14px] font-semibold text-accent disabled:opacity-40"
          >
            {update.isPending ? '…' : 'Сохранить'}
          </button>
        }
      />

      <div className="flex flex-1 flex-col gap-4 px-4 pb-10 pt-1">
        {/* Смена фото — только в режиме редактирования. */}
        <div className="flex justify-center pt-1">
          <AvatarEditor trainer={trainer} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <EditField label="Имя" value={firstName} onChange={setFirstName} placeholder="Имя" />
          <EditField
            label="Фамилия"
            value={lastName}
            onChange={setLastName}
            placeholder="Фамилия"
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={KICKER}>Дата рождения</span>
          <input
            inputMode="numeric"
            value={birthDate}
            onChange={(e) => setBirthDate(maskDate(e.target.value))}
            placeholder="ДД.ММ.ГГГГ"
            maxLength={10}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
          />
        </label>
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
