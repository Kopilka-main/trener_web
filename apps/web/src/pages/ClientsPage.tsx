import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import type { ClientResponse } from '@trener/shared';
import { useClients } from '../api/clients';

function statusBadge(status: ClientResponse['status']) {
  const isActive = status === 'active';
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive ? 'bg-chip text-ink-muted' : 'bg-card-elevated text-ink-mutedxl'
      }`}
    >
      {isActive ? 'Активный' : 'Архив'}
    </span>
  );
}

export function ClientsPage() {
  const clients = useClients();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const list = clients.data ?? [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return list;
    return list.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q));
  }, [clients.data, query]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-4 px-5 pb-6 pt-4">
        <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-none tracking-[-0.02em]">
          Клиенты
        </h1>

        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            placeholder="Поиск по имени"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="shelf w-full rounded-2xl py-3 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-muted"
            aria-label="Поиск по имени"
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
            {clients.data.length === 0
              ? 'Пока нет клиентов. Добавьте первого.'
              : 'Никого не нашлось.'}
          </p>
        )}

        {filtered.length > 0 && (
          <ul className="flex flex-col gap-2">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/clients/${c.id}`}
                  className="row-glow flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 transition-colors active:bg-card-elevated"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-base font-semibold text-ink">
                      {c.firstName} {c.lastName}
                    </span>
                    {c.phone && <span className="truncate text-sm text-ink-muted">{c.phone}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {statusBadge(c.status)}
                    <ChevronRight size={16} className="tile-chevron" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex justify-end px-5">
        <Link
          to="/clients/new"
          aria-label="Добавить клиента"
          className="tile-shadow-primary pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full active:scale-[0.95]"
        >
          <Plus size={24} strokeWidth={2.2} />
        </Link>
      </div>
    </div>
  );
}
