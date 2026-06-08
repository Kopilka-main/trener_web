import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownAZ, CalendarClock, ChevronRight, Plus, Search } from 'lucide-react';
import type { ClientResponse } from '@trener/shared';
import { useClients } from '../api/clients';
import { useSessions } from '../api/sessions';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';

type SortMode = 'alpha' | 'session';

const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

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

function formatNearest(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!m) return date;
  return `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? ''}`;
}

/** Заголовок группы по дате: Сегодня / Завтра / «3 июня». */
function formatGroupDate(date: string, todayIso: string, tomorrowIso: string): string {
  if (date === todayIso) return 'Сегодня';
  if (date === tomorrowIso) return 'Завтра';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!m) return date;
  return `${Number(m[3])} ${MONTHS_GEN[Number(m[2]) - 1] ?? ''}`;
}

interface Nearest {
  date: string;
  time: string;
}

export function ClientsPage() {
  const clients = useClients();
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const sessions = useSessions(todayStr);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('alpha');
  const [typeFilter, setTypeFilter] = useState<'all' | 'online' | 'gym'>('all');

  const list = clients.data ?? [];

  // Ближайшее предстоящее занятие по клиенту (status planned, дата ≥ сегодня) — дата+время.
  const nearestByClient = useMemo(() => {
    const map = new Map<string, Nearest>();
    for (const s of sessions.data ?? []) {
      if (s.status !== 'planned' || s.date < todayStr) continue;
      const cur = map.get(s.clientId);
      if (!cur || s.date < cur.date || (s.date === cur.date && s.startTime < cur.time)) {
        map.set(s.clientId, { date: s.date, time: s.startTime });
      }
    }
    return map;
  }, [sessions.data, todayStr]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((c) => {
        if (typeFilter === 'online' && !c.isOnline) return false;
        if (typeFilter === 'gym' && c.isOnline) return false;
        if (q.length === 0) return true;
        const hay =
          `${c.firstName} ${c.lastName} ${c.phone ?? ''} ${c.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'ru'),
      );
  }, [list, query, typeFilter]);

  // Группировка по дате ближайшего занятия (по возрастанию); без занятий — отдельно.
  const sessionGroups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const da = nearestByClient.get(a.id);
      const db = nearestByClient.get(b.id);
      if (da && db)
        return da.date !== db.date
          ? da.date.localeCompare(db.date)
          : da.time.localeCompare(db.time);
      if (da) return -1;
      if (db) return 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'ru');
    });
    const map = new Map<string, ClientResponse[]>();
    const noSession: ClientResponse[] = [];
    for (const c of sorted) {
      const n = nearestByClient.get(c.id);
      if (!n) {
        noSession.push(c);
        continue;
      }
      const arr = map.get(n.date);
      if (arr) arr.push(c);
      else map.set(n.date, [c]);
    }
    return { dated: [...map.entries()], noSession };
  }, [filtered, nearestByClient]);

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Клиенты" back="/" />

      <div className="flex flex-1 flex-col gap-4 px-2 pb-28 pt-2">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            placeholder="Поиск по имени, тегу"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="shelf w-full rounded-2xl py-3 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-muted"
            aria-label="Поиск по имени, тегу"
          />
        </div>

        {clients.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {clients.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось загрузить клиентов. Попробуйте обновить страницу.
          </p>
        )}

        {clients.isSuccess && filtered.length === 0 && (
          <p className="text-sm text-ink-muted">
            {query.trim().length > 0
              ? 'Никого не нашлось.'
              : 'Пока нет клиентов. Добавьте первого.'}
          </p>
        )}

        {sort === 'alpha' && (
          <ul className="flex flex-col gap-2">
            {filtered.map((c) => (
              <ClientRow key={c.id} client={c} nearest={nearestByClient.get(c.id) ?? null} />
            ))}
          </ul>
        )}

        {sort === 'session' && (
          <>
            {sessionGroups.dated.map(([date, items]) => (
              <div key={date} className="flex flex-col gap-2">
                <div className="px-1 pt-1 font-mono text-[12px] uppercase tracking-wide text-ink-muted">
                  {formatGroupDate(date, todayStr, tomorrowStr)}
                </div>
                <ul className="flex flex-col gap-2">
                  {items.map((c) => (
                    <ClientRow
                      key={c.id}
                      client={c}
                      nearest={nearestByClient.get(c.id) ?? null}
                      showTime
                    />
                  ))}
                </ul>
              </div>
            ))}
            {sessionGroups.noSession.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="px-1 pt-1 font-mono text-[12px] uppercase tracking-wide text-ink-mutedxl">
                  Без занятий
                </div>
                <ul className="flex flex-col gap-2">
                  {sessionGroups.noSession.map((c) => (
                    <ClientRow key={c.id} client={c} nearest={null} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* Нижняя панель: слева сортировка + фильтр по типу, справа FAB добавления. */}
      <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex items-end justify-between gap-2 px-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSort((s) => (s === 'alpha' ? 'session' : 'alpha'))}
            aria-label={
              sort === 'alpha'
                ? 'Переключить на сортировку по занятию'
                : 'Переключить на сортировку по алфавиту'
            }
            className="pointer-events-auto flex h-11 items-center gap-2 rounded-full bg-card px-4 text-[13px] font-semibold text-ink shadow-[0_0_0_1px_var(--color-line)] active:scale-95"
          >
            {sort === 'alpha' ? (
              <CalendarClock size={18} strokeWidth={1.9} />
            ) : (
              <ArrowDownAZ size={18} strokeWidth={1.9} />
            )}
            {sort === 'alpha' ? 'По занятию' : 'По алфавиту'}
          </button>

          <div className="pointer-events-auto flex rounded-full bg-card p-1 shadow-[0_0_0_1px_var(--color-line)]">
            {(
              [
                { value: 'all', label: 'Все' },
                { value: 'online', label: 'Онлайн' },
                { value: 'gym', label: 'Спортзал' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTypeFilter(opt.value)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  typeFilter === opt.value ? 'bg-accent text-accent-on' : 'text-ink-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <Link
          to="/clients/new"
          aria-label="Добавить клиента"
          className="tile-shadow-primary pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full active:scale-[0.95]"
        >
          <Plus size={24} strokeWidth={2.2} />
        </Link>
      </div>
    </div>
  );
}

function ClientRow({
  client,
  nearest,
  showTime = false,
}: {
  client: ClientResponse;
  nearest?: Nearest | null;
  showTime?: boolean;
}) {
  const archived = client.status === 'archived';
  return (
    <li>
      <Link
        to={`/clients/${client.id}`}
        className={`row-glow flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 transition-colors active:bg-card-elevated ${
          archived ? 'opacity-60' : ''
        }`}
      >
        <Avatar
          firstName={client.firstName}
          lastName={client.lastName}
          size={44}
          muted={archived}
          src={client.avatarFileId ? `/api/files/${client.avatarFileId}` : null}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold text-ink">
            {client.firstName} {client.lastName}
          </span>
          {nearest ? (
            <span className="font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
              {showTime ? nearest.time : formatNearest(nearest.date)}
            </span>
          ) : (
            <span
              className={`truncate font-[family-name:var(--font-mono)] text-[12px] ${
                client.phone ? 'text-ink-muted' : 'text-ink-mutedxl'
              }`}
            >
              {client.phone ?? 'без телефона'}
            </span>
          )}
        </span>
        <ChevronRight size={16} className="tile-chevron shrink-0" />
      </Link>
    </li>
  );
}
