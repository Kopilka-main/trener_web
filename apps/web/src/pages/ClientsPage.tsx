import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import type { ClientResponse } from '@trener/shared';
import { useClients } from '../api/clients';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';

type StatusFilter = 'active' | 'archived';

export function ClientsPage() {
  const clients = useClients();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');

  const list = clients.data ?? [];
  const archivedCount = useMemo(() => list.filter((c) => c.status === 'archived').length, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((c) => c.status === filter)
      .filter((c) => {
        if (q.length === 0) return true;
        const hay = `${c.firstName} ${c.lastName} ${c.phone ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'ru'),
      );
  }, [list, filter, query]);

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Клиенты" back="/" />

      <div className="flex flex-1 flex-col gap-4 px-5 pb-28 pt-2">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            placeholder="Поиск по имени или телефону"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="shelf w-full rounded-2xl py-3 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-muted"
            aria-label="Поиск по имени или телефону"
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

        {filtered.length > 0 && (
          <ul className="flex flex-col gap-2">
            {filtered.map((c) => (
              <ClientRow key={c.id} client={c} />
            ))}
          </ul>
        )}
      </div>

      {/* Нижняя панель: фильтр статуса (слева) + FAB добавления (справа). */}
      <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex items-end justify-between gap-3 px-5">
        <div className="pointer-events-auto flex gap-1.5 rounded-full bg-card p-1 shadow-[0_0_0_1px_var(--color-line)]">
          <FilterTab active={filter === 'active'} onClick={() => setFilter('active')}>
            Активные
          </FilterTab>
          <FilterTab active={filter === 'archived'} onClick={() => setFilter('archived')}>
            Архив{archivedCount > 0 ? ` · ${archivedCount}` : ''}
          </FilterTab>
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

function ClientRow({ client }: { client: ClientResponse }) {
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
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold text-ink">
            {client.firstName} {client.lastName}
          </span>
          <span
            className={`truncate font-[family-name:var(--font-mono)] text-[12px] ${
              client.phone ? 'text-ink-muted' : 'text-ink-mutedxl'
            }`}
          >
            {client.phone ?? 'без телефона'}
          </span>
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
