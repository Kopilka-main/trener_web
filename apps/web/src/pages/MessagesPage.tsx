import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { useConversations } from '../api/chat';
import { useClients } from '../api/clients';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';

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

export function MessagesPage() {
  const conversations = useConversations();
  const clients = useClients();

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

      <div className="flex flex-1 flex-col gap-2 px-5 pb-8 pt-2">
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
          return (
            <Link
              key={conv.id}
              to={`/clients/${conv.clientId}/chat`}
              className="row-glow flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 transition-colors active:bg-card-elevated"
            >
              <Avatar firstName={c?.firstName ?? '·'} lastName={c?.lastName ?? ''} size={44} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold text-ink">{name}</span>
                <span className="truncate font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
                  {relativeTime(conv.lastMessageAt)}
                </span>
              </span>
              <ChevronRight size={16} className="tile-chevron shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
