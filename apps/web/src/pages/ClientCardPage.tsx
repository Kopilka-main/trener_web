import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BarChart3,
  Cake,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  FileText,
  MessageSquare,
  Pencil,
  Phone,
  TrendingUp,
  Unlink,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useClient, useUpdateClient } from '../api/clients';
import { useClientWorkouts } from '../api/client-workouts';
import { useClientPackages } from '../api/packages';
import { useClientSessions } from '../api/sessions';
import { aggregateExerciseOverview } from '../lib/workout-stats';
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

const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** Дата рождения «11 июня 1990» из ISO YYYY-MM-DD. Пусто/некорректно → ''. */
function formatBirthDate(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso) : null;
  if (!m) return '';
  return `${String(Number(m[3]))} ${MONTHS_GEN[Number(m[2]) - 1] ?? ''} ${m[1]}`;
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
  { key: 'stats', label: 'Прогресс', sub: 'рекорды и история', Icon: BarChart3 },
  { key: 'payments', label: 'Оплата', sub: 'пакеты и расходы', Icon: Wallet },
  { key: 'medcard', label: 'Медкарта', sub: 'файлы и заметки', Icon: FileText },
  { key: 'profile', label: 'Профиль', sub: 'контакты и данные', Icon: Pencil },
];

export function ClientCardPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';

  const client = useClient(id);
  const workouts = useClientWorkouts(id);
  const packages = useClientPackages(id);
  const sessions = useClientSessions(id);
  const updateMutation = useUpdateClient(id);
  const [connectOpen, setConnectOpen] = useState(false);

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
  const isArchived = c.status === 'archived';
  const age = ageFromBirthDate(c.birthDate);
  // Достижения = упражнения с рекордом в последней сессии (зелёная стрелка ↑ в статистике).
  const achievements = aggregateExerciseOverview(workouts.data ?? []).filter(
    (o) => o.lastIsRecord,
  ).length;
  const connected = (c.accountId ?? '').trim() !== '';
  // Баланс оплаченных занятий = оплачено (по активным пакетам) − проведено (завершённые
  // тренировки). Может быть отрицательным — клиент должен за проведённые занятия.
  const paidLessons = (packages.data ?? [])
    .filter((p) => p.status === 'active')
    .reduce((acc, p) => acc + p.lessonsPaid, 0);
  // Баланс пакета уменьшают только тренерские проведённые тренировки: самостоятельные
  // тренировки клиента и исторические записи в зачёт не идут.
  const completedWorkouts = (workouts.data ?? []).filter(
    (w) => w.status === 'completed' && !w.excludedFromBalance && !w.createdByClient,
  ).length;
  const paidBalance = paidLessons - completedWorkouts;
  // Календарь: «запланировано / ещё можно записать из оплаченных».
  // Второе число = остаток оплаты (paidBalance) − уже запланированные занятия.
  // Так плитки бьются: запланировано + осталось_записать = остаток оплаты (Оплата +N).
  // Отрицательное → записано больше, чем оплачено (перезапись).
  const sessionList = sessions.data ?? [];
  const plannedSessions = sessionList.filter((s) => s.status === 'planned').length;
  const calBalance = paidBalance - plannedSessions;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-5 px-2 pb-8 pt-4">
        {/* Шапка профиля: аватар + имя (возраст убран — он ниже у даты рождения). */}
        <div className="flex items-center gap-4">
          <Avatar
            firstName={c.firstName}
            lastName={c.lastName}
            size={64}
            muted={isArchived}
            src={c.avatarFileId ? `/api/files/${c.avatarFileId}` : null}
          />
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
          </div>
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
            // Бейдж справа: прогресс последней тренировки / баланс оплаченных занятий.
            // «Написать» доступно только при подключённом клиенте (есть accountId).
            const chatLocked = key === 'chat' && !connected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (chatLocked) setConnectOpen(true);
                  else void navigate(`/clients/${id}/${key}`);
                }}
                className={`flex flex-col gap-3 rounded-2xl p-4 text-left ${
                  chatLocked ? 'shelf opacity-60' : 'tile-shadow active:scale-[0.98]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <Icon
                    size={22}
                    strokeWidth={1.8}
                    className={chatLocked ? 'text-ink-muted' : 'text-ink'}
                  />
                  {chatLocked && (
                    <Unlink
                      size={18}
                      strokeWidth={1.8}
                      className="text-danger"
                      aria-label="Нет связи"
                    />
                  )}
                  {key === 'calendar' && (plannedSessions > 0 || sessionList.length > 0) && (
                    <span className="flex items-baseline gap-0.5 text-[22px] font-bold leading-none text-ink">
                      <span>{plannedSessions}</span>
                      <span className="text-[16px] text-ink-mutedxl">/</span>
                      <span className={calBalance < 0 ? 'text-danger' : 'text-ink'}>
                        {calBalance > 0 ? `+${String(calBalance)}` : calBalance}
                      </span>
                    </span>
                  )}
                  {key === 'stats' && achievements > 0 && (
                    <span className="flex items-center gap-1 text-[22px] font-bold leading-none text-ink">
                      {achievements}
                      <TrendingUp size={18} strokeWidth={2.4} className="text-accent-text" />
                    </span>
                  )}
                  {key === 'payments' && (
                    <span
                      className={`text-[22px] font-bold leading-none ${
                        paidBalance < 0 ? 'text-danger' : 'text-accent-text'
                      }`}
                    >
                      {paidBalance > 0 ? `+${String(paidBalance)}` : String(paidBalance)}
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

        {/* Контакты — отдельными полями (шаг как между плитками): телефон + дата рождения. */}
        {(c.phone || c.birthDate) && (
          <div className="flex flex-col gap-3">
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 active:opacity-70"
              >
                <Phone size={18} strokeWidth={1.9} className="shrink-0 text-accent-text" />
                <span className="text-[15px] font-medium text-ink">{c.phone}</span>
              </a>
            )}
            {c.birthDate && (
              <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
                <Cake size={18} strokeWidth={1.9} className="shrink-0 text-ink-muted" />
                <span className="text-[15px] text-ink">
                  {formatBirthDate(c.birthDate)}
                  {age !== null && (
                    <span className="text-ink-muted">
                      {' · '}
                      {age} {pluralizeYears(age)}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}

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

      {connectOpen && (
        <ConnectClientDialog
          pending={updateMutation.isPending}
          onConnect={(code) =>
            updateMutation.mutate(
              { accountId: code },
              {
                onSuccess: () => {
                  setConnectOpen(false);
                  void navigate(`/clients/${id}/chat`);
                },
              },
            )
          }
          onClose={() => setConnectOpen(false)}
        />
      )}
    </div>
  );
}

/** Диалог подключения: объясняет, зачем нужен ID, и принимает его. */
function ConnectClientDialog({
  pending,
  onConnect,
  onClose,
}: {
  pending: boolean;
  onConnect: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        <h2 className="text-[17px] font-bold text-ink">Нет связи с клиентом</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          Чтобы писать клиенту, укажите его клиентский номер (ID) из приложения клиента.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ID клиента"
          aria-label="ID клиента"
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
            onClick={() => onConnect(code.trim())}
            disabled={code.trim() === '' || pending}
            className="flex-1 rounded-xl bg-accent py-3 text-[14px] font-semibold text-accent-on disabled:opacity-40"
          >
            {pending ? '…' : 'Подключить'}
          </button>
        </div>
      </div>
    </div>
  );
}
