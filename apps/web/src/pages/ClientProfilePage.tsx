import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AtSign,
  CalendarDays,
  Link2,
  Mail,
  MessageCircle,
  Phone,
  type LucideIcon,
} from 'lucide-react';
import { useClient } from '../api/clients';
import { Avatar } from '../components/Avatar';

/** Полных лет по дате рождения (YYYY-MM-DD); null, если пусто/некорректно. */
function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(birthDate);
  if (!m) return null;
  const by = Number(m[1]);
  const bm = Number(m[2]);
  const bd = Number(m[3]);
  const now = new Date();
  let age = now.getFullYear() - by;
  if (now.getMonth() + 1 < bm || (now.getMonth() + 1 === bm && now.getDate() < bd)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

function pluralizeYears(age: number): string {
  const mod100 = age % 100;
  const mod10 = age % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'лет';
  if (mod10 === 1) return 'год';
  if (mod10 >= 2 && mod10 <= 4) return 'года';
  return 'лет';
}

/** ISO «1990-06-11» → «11.06.1990». Пусто → ''. */
function birthDisplay(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function contactIcon(type: string): LucideIcon {
  if (type === 'Телефон' || type === 'WhatsApp') return Phone;
  if (type === 'Email') return Mail;
  if (type === 'Instagram' || type === 'ВКонтакте') return AtSign;
  return MessageCircle;
}

/** Действие по тапу на контакт: звонок (tel:), WhatsApp (wa.me), почта (mailto:),
 * мессенджеры/соцсети — на их сайт/приложение. null — значение не кликабельно. */
function contactHref(type: string, value: string): string | null {
  const v = value.trim();
  if (v === '') return null;
  const digits = v.replace(/\D/g, '');
  const phone = v.replace(/[^\d+]/g, '');
  const handle = v.replace(/^@/, '');
  const isUrl = /^https?:\/\//iu.test(v);
  switch (type) {
    case 'Телефон':
      return phone ? `tel:${phone}` : null;
    case 'WhatsApp':
      return digits ? `https://wa.me/${digits}` : null;
    case 'Email':
      return `mailto:${v}`;
    case 'Telegram':
      return isUrl ? v : `https://t.me/${handle}`;
    case 'Instagram':
      return isUrl ? v : `https://instagram.com/${handle}`;
    case 'ВКонтакте':
      return isUrl ? v : `https://vk.com/${handle}`;
    default:
      return null;
  }
}

/** Строка «подпись + значение» с иконкой. Если задан href — вся строка кликабельна
 * (звонок/WhatsApp/почта и т.п.); внешние ссылки открываются в новой вкладке. */
function DataRow({
  icon: Icon,
  label,
  value,
  href,
  first,
  onCopy,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string | null;
  first: boolean;
  onCopy: (value: string) => void;
}) {
  const external = href ? /^https?:\/\//iu.test(href) : false;
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  // Долгое нажатие (~0.6с) → копируем значение поля; короткий тап работает как раньше
  // (звонок/ссылка). Флаг longPressed гасит переход по href после удержания.
  function startPress() {
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onCopy(value);
    }, 600);
  }
  function cancelPress() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  const pressProps = {
    onPointerDown: startPress,
    onPointerUp: cancelPress,
    onPointerLeave: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const inner = (
    <div className="flex select-none items-center gap-3 px-4 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-ink-muted">
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12px] text-ink-muted">{label}</span>
        <span className={`truncate text-[15px] ${href ? 'text-accent-text' : 'text-ink'}`}>
          {value}
        </span>
      </span>
    </div>
  );
  return (
    <div>
      {!first && <div className="mx-4 h-px bg-line" />}
      {href ? (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          onClick={(e) => {
            if (longPressed.current) {
              e.preventDefault();
              longPressed.current = false;
            }
          }}
          {...pressProps}
          className="block active:bg-card-elevated"
        >
          {inner}
        </a>
      ) : (
        <div {...pressProps} className="active:bg-card-elevated">
          {inner}
        </div>
      )}
    </div>
  );
}

/** Просмотр профиля клиента: показывает только ЗАПОЛНЕННЫЕ поля. Изменения — по
 * кнопке «Редактировать» (→ форма). Открывается из плитки «Профиль» карточки клиента. */
export function ClientProfilePage() {
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const client = useClient(id);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  function copyValue(value: string) {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(true);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  if (client.isPending) {
    return <p className="px-2 py-6 text-sm text-ink-muted">Загрузка…</p>;
  }
  if (client.isError || !client.data) {
    return (
      <p className="px-2 py-6 text-sm text-ink-muted" role="alert">
        Не удалось загрузить клиента.
      </p>
    );
  }

  const c = client.data;
  const age = ageFromBirthDate(c.birthDate);
  const birth = birthDisplay(c.birthDate);
  const filled = c.contacts.filter((ct) => ct.value.trim() !== '');
  const displayContacts =
    filled.length > 0 ? filled : c.phone ? [{ type: 'Телефон', value: c.phone }] : [];
  const accountId = (c.accountId ?? '').trim();
  // Индекс строки в карточке «Данные» (для разделителей): контакты, затем дата, затем связь.
  let rowIndex = 0;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-5 px-2 pb-8 pt-4">
        {/* Редактировать — в правом верхнем углу (→ форма). */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void navigate(`/clients/${id}/edit`)}
            className="rounded-full bg-card px-4 py-1.5 text-[14px] font-semibold text-accent-text active:bg-card-elevated"
          >
            Править
          </button>
        </div>

        {/* Аватар + имя + возраст по центру. */}
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar
            firstName={c.firstName}
            lastName={c.lastName}
            size={96}
            src={c.avatarFileId ? `/api/files/${c.avatarFileId}` : null}
          />
          <h1 className="text-[24px] font-bold leading-tight text-ink">
            {c.firstName} {c.lastName}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-ink-muted">
            <span className="rounded-full bg-chip px-3 py-1">
              {c.isOnline ? 'Онлайн' : 'Спортзал'}
            </span>
            {age !== null && (
              <span>
                {age} {pluralizeYears(age)}
              </span>
            )}
          </div>
        </div>

        {/* Данные: только заполненные (контакты + дата рождения + связь). */}
        {(displayContacts.length > 0 || birth || accountId !== '') && (
          <section className="flex flex-col gap-1.5">
            <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
              Данные
            </h2>
            <div className="overflow-hidden rounded-2xl bg-card">
              {displayContacts.map((ct, i) => (
                <DataRow
                  key={`${ct.type}-${String(i)}`}
                  icon={contactIcon(ct.type)}
                  label={ct.type}
                  value={ct.value}
                  href={contactHref(ct.type, ct.value)}
                  first={rowIndex++ === 0}
                  onCopy={copyValue}
                />
              ))}
              {birth && (
                <DataRow
                  icon={CalendarDays}
                  label="День рождения"
                  value={birth}
                  first={rowIndex++ === 0}
                  onCopy={copyValue}
                />
              )}
              {accountId !== '' && (
                <DataRow
                  icon={Link2}
                  label="Клиентский ID"
                  value={accountId}
                  first={rowIndex++ === 0}
                  onCopy={copyValue}
                />
              )}
            </div>
          </section>
        )}

        {/* Теги. */}
        {c.tags.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
              Теги
            </h2>
            <div className="flex flex-wrap gap-2">
              {c.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-chip px-3 py-1 text-[13px] text-ink">
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Заметки. */}
        {c.notes && (
          <section className="flex flex-col gap-1.5">
            <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
              Заметки
            </h2>
            <p className="whitespace-pre-wrap rounded-2xl bg-card px-4 py-3 text-[15px] leading-relaxed text-ink">
              {c.notes}
            </p>
          </section>
        )}
      </div>

      {/* Тост «Скопировано» при долгом нажатии на поле. */}
      {copied && (
        <div className="pointer-events-none fixed inset-x-0 bottom-10 z-50 flex justify-center px-6">
          <div
            className="rounded-full px-4 py-2 text-[13px] font-medium shadow-lg"
            style={{ background: 'var(--color-ink)', color: 'var(--color-card)' }}
          >
            Скопировано
          </div>
        </div>
      )}
    </div>
  );
}
