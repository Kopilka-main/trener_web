import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownAZ, CalendarClock, ChevronRight, Plus, Search } from 'lucide-react';
import type { ClientResponse } from '@trener/shared';
import { useClients } from '../api/clients';
import { useSessions } from '../api/sessions';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';

type StatusFilter = 'active' | 'archived';
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

function formatNearest(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!m) return date;
  return `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? ''}`;
}

export function ClientsPage() {
  const clients = useClients();
  const todayStr = new Date().toISOString().slice(0, 10);
  const sessions = useSessions(todayStr);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [sort, setSort] = useState<SortMode>('alpha');

  const list = clients.data ?? [];

  // Ближайшее предстоящее занятие по клиенту (status planned, дата ≥ сегодня).
  const nearestByClient = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions.data ?? []) {
      if (s.status !== 'planned' || s.date < todayStr) continue;
      const cur = map.get(s.clientId);
      if (!cur || s.date < cur) map.set(s.clientId, s.date);
    }
    return map;
  }, [sessions.data, todayStr]);
  const archivedCount = useMemo(() => list.filter((c) => c.status === 'archived').length, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((c) => c.status === filter)
      .filter((c) => {
        if (q.length === 0) return true;
        const hay =
          `${c.firstName} ${c.lastName} ${c.phone ?? ''} ${c.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'ru'),
      );
  }, [list, filter, query]);

  // Группировка по первой букве имени (для алфавитных секций).
  const groups = useMemo(() => {
    const map = new Map<string, ClientResponse[]>();
    for (const c of filtered) {
      const letter = (c.firstName.trim()[0] ?? '#').toUpperCase();
      const arr = map.get(letter);
      if (arr) arr.push(c);
      else map.set(letter, [c]);
    }
    return [...map.entries()];
  }, [filtered]);

  // Сортировка по ближайшему занятию: сперва клиенты с предстоящим занятием
  // (по возрастанию даты), затем без занятия — по имени.
  const bySession = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = nearestByClient.get(a.id);
      const db = nearestByClient.get(b.id);
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'ru');
    });
  }, [filtered, nearestByClient]);

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Клиенты" back="/" />

      <div className="flex flex-1 flex-col gap-4 px-5 pb-28 pt-2">
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
              : filter === 'active'
                ? 'Пока нет клиентов. Добавьте первого.'
                : 'В архиве пусто.'}
          </p>
        )}

        {sort === 'alpha' &&
          groups.map(([letter, items]) => (
            <div key={letter} className="flex flex-col gap-2">
              <div className="px-1 pt-1 font-mono text-[12px] uppercase tracking-wide text-ink-muted">
                {letter}
              </div>
              <ul className="flex flex-col gap-2">
                {items.map((c) => (
                  <ClientRow key={c.id} client={c} nearest={nearestByClient.get(c.id) ?? null} />
                ))}
              </ul>
            </div>
          ))}

        {sort === 'session' && filtered.length > 0 && (
          <ul className="flex flex-col gap-2">
            {bySession.map((c) => (
              <ClientRow key={c.id} client={c} nearest={nearestByClient.get(c.id) ?? null} />
            ))}
          </ul>
        )}
      </div>

      {/* Нижняя панель: фильтр статуса (слева) + FAB добавления (справа). */}
      <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex items-end justify-between gap-3 px-5">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex gap-1.5 rounded-full bg-card p-1 shadow-[0_0_0_1px_var(--color-line)]">
            <FilterTab active={filter === 'active'} onClick={() => setFilter('active')}>
              Активные
            </FilterTab>
            <FilterTab active={filter === 'archived'} onClick={() => setFilter('archived')}>
              Архив{archivedCount > 0 ? ` · ${archivedCount}` : ''}
            </FilterTab>
          </div>
          <button
            type="button"
            onClick={() => setSort((s) => (s === 'alpha' ? 'session' : 'alpha'))}
            aria-label={sort === 'alpha' ? 'Сортировка: по алфавиту' : 'Сортировка: по занятию'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-[0_0_0_1px_var(--color-line)] active:scale-95"
          >
            {sort === 'alpha' ? (
              <ArrowDownAZ size={20} strokeWidth={1.9} />
            ) : (
              <CalendarClock size={20} strokeWidth={1.9} />
            )}
          </button>
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

function ClientRow({ client, nearest }: { client: ClientResponse; nearest?: string | null }) {
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
            <span className="flex items-center gap-1 font-[family-name:var(--font-mono)] text-[12px] text-accent">
              <CalendarClock size={12} strokeWidth={2} />
              {formatNearest(nearest)}
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

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
        active ? 'bg-accent text-accent-on' : 'text-ink-muted active:bg-card-elevated'
      }`}
    >
      {children}
    </button>
  );
}
