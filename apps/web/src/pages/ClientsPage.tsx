import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ClientResponse } from '@trener/shared';
import { useClients } from '../api/clients';

function statusBadge(status: ClientResponse['status']) {
  const isActive = status === 'active';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-500'
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
      <div className="flex flex-col gap-4 px-5 py-6">
        <h1 className="text-2xl font-semibold text-slate-900">Клиенты</h1>

        <input
          type="search"
          placeholder="Поиск по имени"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-500"
          aria-label="Поиск по имени"
        />

        {clients.isPending && <p className="text-sm text-slate-500">Загрузка…</p>}

        {clients.isError && (
          <p className="text-sm text-slate-500" role="alert">
            Не удалось загрузить клиентов. Попробуйте обновить страницу.
          </p>
        )}

        {clients.isSuccess && filtered.length === 0 && (
          <p className="text-sm text-slate-500">
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
                  className="flex items-center justify-between gap-3 rounded-2xl bg-slate-100 px-4 py-3"
                >
                  <span className="flex flex-col">
                    <span className="text-base font-medium text-slate-900">
                      {c.firstName} {c.lastName}
                    </span>
                    {c.phone && <span className="text-sm text-slate-500">{c.phone}</span>}
                  </span>
                  {statusBadge(c.status)}
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
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-3xl leading-none text-white shadow-lg"
        >
          +
        </Link>
      </div>
    </div>
  );
}
