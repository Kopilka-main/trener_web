import { useNavigate, useParams } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  FileText,
  MessageSquare,
  Pencil,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useClient } from '../api/clients';
import { useClientWorkouts } from '../api/client-workouts';
import { Avatar } from '../components/Avatar';

/** Полных лет по дате рождения (YYYY-MM-DD); null, если дата пуста или некорректна.
 *  Разбираем компоненты строки напрямую (без new Date) — иначе UTC-парсинг даёт
 *  таймзонный сдвиг и возраст может округлиться в большую сторону. */
function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(birthDate);
  if (!m) return null;
  const by = Number(m[1]);
  const bm = Number(m[2]);
  const bd = Number(m[3]);
  const now = new Date();
  const ty = now.getFullYear();
  const tm = now.getMonth() + 1;
  const td = now.getDate();
  let age = ty - by;
  // День рождения в этом году ещё не наступил — минус год.
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

/** Склонение «год / года / лет» по числу лет. */
function pluralizeYears(age: number): string {
  const mod100 = age % 100;
  const mod10 = age % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'лет';
  if (mod10 === 1) return 'год';
  if (mod10 >= 2 && mod10 <= 4) return 'года';
  return 'лет';
}

interface Tile {
  key: string;
  label: string;
  sub: string;
  Icon: LucideIcon;
}

const TILES: Tile[] = [
  { key: 'calendar', label: 'Календарь', sub: 'занятия клиента', Icon: CalendarDays },
  { key: 'chat', label: 'Написать', sub: 'чат с клиентом', Icon: MessageSquare },
  { key: 'stats', label: 'Статистика', sub: 'прогресс и история', Icon: BarChart3 },
  { key: 'payments', label: 'Оплата', sub: 'пакеты и расходы', Icon: Wallet },
  { key: 'medcard', label: 'Медкарта', sub: 'файлы и заметки', Icon: FileText },
  { key: 'edit', label: 'Профиль', sub: 'контакты и данные', Icon: Pencil },
];

export function ClientCardPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';

  const client = useClient(id);
  const workouts = useClientWorkouts(id);

  if (client.isPending) {
    return <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>;
  }

  if (client.isError || !client.data) {
    return (
      <p className="px-5 py-6 text-sm text-ink-muted" role="alert">
        Не удалось загрузить клиента.
      </p>
    );
  }

  const c = client.data;
  const isArchived = c.status === 'archived';
  const age = ageFromBirthDate(c.birthDate);
  const completedCount = workouts.data?.filter((w) => w.status === 'completed').length ?? 0;
  const connected = (c.accountId ?? '').trim() !== '';

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-5 px-5 pb-8 pt-4">
        {/* Шапка профиля: аватар + имя + возраст + связь (цвет по подключению). */}
        <div className="flex items-center gap-4">
          <Avatar firstName={c.firstName} lastName={c.lastName} size={64} muted={isArchived} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 text-[26px] font-bold leading-tight text-ink">
                {c.firstName} {c.lastName}
              </h1>
              {isArchived && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-chip px-2.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.04em] text-ink-muted">
                  Архив
                </span>
              )}
            </div>
            {age !== null && (
              <span className="text-[14px] text-ink-muted">
                {age} {pluralizeYears(age)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void navigate(`/clients/${id}/edit`)}
            aria-label={connected ? 'Клиент подключён' : 'Подключить клиента'}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-elevated ${
              connected ? 'text-accent' : 'text-danger'
            }`}
          >
            <svg width={22} height={22} viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
              <path d="M680-160v-120H560v-80h120v-120h80v120h120v80H760v120h-80ZM440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm560-40h-80q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480Z" />
            </svg>
          </button>
        </div>

        {/* Теги. */}
        {c.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {c.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-chip px-3 py-1 text-[13px] text-ink">
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        )}

        {/* Большая primary-плитка: переход к тренировкам. */}
        <button
          type="button"
          onClick={() => void navigate(`/clients/${id}/workouts`)}
          className="cta-launch tile-shadow-primary flex items-center gap-4 rounded-2xl bg-accent px-5 py-4 text-left text-accent-on active:scale-[0.98]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/10">
            <Dumbbell size={22} strokeWidth={2} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[16px] font-bold leading-tight">Перейти к тренировкам</span>
            <span className="text-[12px] opacity-70">текущая + история</span>
          </span>
          <span className="flex shrink-0 items-center">
            <ChevronRight
              size={22}
              strokeWidth={2.6}
              className="cta-chevron cta-chevron-1 -mr-2.5"
            />
            <ChevronRight
              size={22}
              strokeWidth={2.6}
              className="cta-chevron cta-chevron-2 -mr-2.5"
            />
            <ChevronRight size={22} strokeWidth={2.6} className="cta-chevron cta-chevron-3" />
          </span>
        </button>

        {/* Сетка плиток-разделов. */}
        <div className="grid grid-cols-2 gap-3">
          {TILES.map(({ key, label, sub, Icon }) => {
            const showCount = key === 'stats' && completedCount > 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => void navigate(`/clients/${id}/${key}`)}
                className="tile-shadow flex flex-col gap-3 rounded-2xl p-4 text-left active:scale-[0.98]"
              >
                <div className="flex items-start justify-between">
                  <Icon size={22} strokeWidth={1.8} className="text-ink" />
                  {showCount && (
                    <span className="text-[22px] font-bold leading-none text-ink">
                      {completedCount}
                    </span>
                  )}
                </div>
                <span className="flex flex-col">
                  <span className="text-[14px] font-bold leading-tight text-ink">{label}</span>
                  <span className="text-[11px] text-ink-muted">{sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Заметки. */}
        {c.notes && (
          <section className="flex flex-col gap-1.5">
            <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
              Заметки
            </h2>
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{c.notes}</p>
          </section>
        )}
      </div>
    </div>
  );
}
