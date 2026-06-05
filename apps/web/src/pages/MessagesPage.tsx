import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MessageSquare, Search, X } from 'lucide-react';
import type { ClientResponse } from '@trener/shared';
import { useConversations } from '../api/chat';
import { useClients } from '../api/clients';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';

/** Совпадение клиента с запросом по имени, контактам или тегам. */
function clientMatches(c: ClientResponse, q: string): boolean {
  const ql = q.trim().toLowerCase();
  if (ql === '') return true;
  if (`${c.firstName} ${c.lastName}`.toLowerCase().includes(ql)) return true;
  if (
    c.contacts.some(
      (ct) => ct.value.toLowerCase().includes(ql) || ct.type.toLowerCase().includes(ql),
    )
  )
    return true;
  return c.tags.some((t) => t.toLowerCase().includes(ql));
}

/** Относительное время последней активности диалога. */
function relativeTime(iso: string | null): string {
  if (!iso) return 'нет сообщений';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'вчера';
  if (days < 7) return `${String(days)} дн назад`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** «новое сообщение / новых сообщения / новых сообщений» по числу. */
function pluralMessages(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'новое сообщение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'новых сообщения';
  return 'новых сообщений';
}

export function MessagesPage() {
  const conversations = useConversations();
  const clients = useClients();
  const [query, setQuery] = useState('');

  // Результаты поиска по всем клиентам (для «написать» любому, не только из диалогов).
  const searchResults = useMemo(() => {
    const q = query.trim();
    if (q === '') return [];
    return (clients.data ?? [])
      .filter((c) => c.status === 'active' && clientMatches(c, q))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [clients.data, query]);

  const clientById = useMemo(() => {
    const m = new Map<string, { firstName: string; lastName: string }>();
    for (const c of clients.data ?? [])
      m.set(c.id, { firstName: c.firstName, lastName: c.lastName });
    return m;
  }, [clients.data]);

  // Диалоги по убыванию последней активности (без сообщений — в конец).
  const list = useMemo(() => {
    return [...(conversations.data ?? [])].sort((a, b) => {
      const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return tb - ta;
    });
  }, [conversations.data]);

  const pending = conversations.isPending || clients.isPending;

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Сообщения" back="/" />

      <div className="flex flex-1 flex-col gap-2 px-2 pb-8 pt-2">
        {/* Поиск клиента по имени или контакту — написать любому. */}
        <div className="flex items-center gap-2 rounded-xl border border-line bg-chip px-3 py-2.5">
          <Search size={16} className="shrink-0 text-ink-mutedxl" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск клиента по имени или контакту"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-mutedxl"
          />
          {query !== '' && (
            <button
              type="button"
              aria-label="Очистить"
              onClick={() => setQuery('')}
              className="shrink-0 text-ink-muted active:text-ink"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Режим поиска: список найденных клиентов → открыть чат. */}
        {query.trim() !== '' ? (
          searchResults.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">Никого не найдено.</p>
          ) : (
            searchResults.map((c) => {
              const contact = c.contacts.find((x) => x.value.trim() !== '');
              return (
                <Link
                  key={c.id}
                  to={`/clients/${c.id}/chat`}
                  className="row-glow flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 transition-colors active:bg-card-elevated"
                >
                  <Avatar firstName={c.firstName} lastName={c.lastName} size={44} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold text-ink">
                      {c.firstName} {c.lastName}
                    </span>
                    {contact && (
                      <span className="truncate text-[12px] text-ink-muted">
                        {contact.type}: {contact.value}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={16} className="tile-chevron shrink-0" />
                </Link>
              );
            })
          )
        ) : (
          <>
            {pending && <p className="text-sm text-ink-muted">Загрузка…</p>}

            {conversations.isError && (
              <p className="text-sm text-ink-muted" role="alert">
                Не удалось загрузить диалоги. Попробуйте обновить страницу.
              </p>
            )}

            {conversations.isSuccess && list.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <MessageSquare size={28} strokeWidth={1.6} className="text-ink-muted" />
                <p className="text-sm text-ink-muted">Пока нет диалогов с клиентами.</p>
              </div>
            )}

            {list.map((conv) => {
              const c = clientById.get(conv.clientId);
              const name = c ? `${c.firstName} ${c.lastName}` : 'Клиент';
              const unread = conv.unreadCount > 0;
              return (
                <Link
                  key={conv.id}
                  to={`/clients/${conv.clientId}/chat`}
                  className="row-glow flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 transition-colors active:bg-card-elevated"
                >
                  <div className="relative shrink-0">
                    <Avatar
                      firstName={c?.firstName ?? '·'}
                      lastName={c?.lastName ?? ''}
                      size={44}
                    />
                    {unread && (
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent ring-2 ring-card" />
                    )}
                  </div>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`truncate text-[15px] ${unread ? 'font-bold text-ink' : 'font-semibold text-ink'}`}
                    >
                      {name}
                    </span>
                    <span
                      className={`truncate font-[family-name:var(--font-mono)] text-[12px] ${
                        unread ? 'font-semibold text-ink' : 'text-ink-muted'
                      }`}
                    >
                      {unread
                        ? `${String(conv.unreadCount)} ${pluralMessages(conv.unreadCount)}`
                        : relativeTime(conv.lastMessageAt)}
                    </span>
                  </span>
                  {unread ? (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-accent-on">
                      {conv.unreadCount}
                    </span>
                  ) : (
                    <ChevronRight size={16} className="tile-chevron shrink-0" />
                  )}
                </Link>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
