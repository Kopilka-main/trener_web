import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Clock, MessageSquare, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useClientSessions } from '../api/calendar';
import { useClientChatUnread, useMarkChatRead } from '../api/chat';
import { useClientPackages } from '../api/packages';
import { HoldToDelete } from '../components/HoldToDelete';
import { toISODate } from '../lib/calendar';
import {
  buildClientNotifications,
  dismissNotification,
  loadDismissed,
  type ClientNotificationKind,
} from '../lib/notifications';

const ICONS: Record<ClientNotificationKind, LucideIcon> = {
  confirm: CalendarPlus,
  soon: Clock,
  chat: MessageSquare,
  package: Wallet,
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const now = new Date();
  const from = toISODate(now);
  const to = toISODate(new Date(now.getTime() + 30 * 86400000));

  const sessions = useClientSessions(from, to).data ?? [];
  const unread = useClientChatUnread().data ?? 0;
  const packages = useClientPackages().data ?? [];
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  const items = buildClientNotifications({ sessions, unread, now, dismissed, packages });

  // Уход со страницы уведомлений = «увидел» новые сообщения → отмечаем чат прочитанным,
  // чтобы счётчик непрочитанных (плитка «Уведомления» на главной) сбросился. Карточка
  // остаётся видимой и кликабельной всё время просмотра — отметка происходит при размонтировании.
  const markReadMutate = useMarkChatRead().mutate;
  const unreadRef = useRef(unread);
  unreadRef.current = unread;
  useEffect(() => {
    return () => {
      if (unreadRef.current > 0) markReadMutate();
    };
  }, [markReadMutate]);

  return (
    <div className="flex h-full flex-col">
      <h1 className="px-4 pt-5 font-[family-name:var(--font-display)] text-[24px] text-ink">
        Уведомления
      </h1>

      <div className="flex flex-1 flex-col gap-2 px-4 pb-6 pt-3">
        {items.length === 0 ? (
          <p className="m-auto text-sm text-ink-muted">Уведомлений нет.</p>
        ) : (
          items.map((n) => {
            const Icon = ICONS[n.kind];
            return (
              <div key={n.id} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
                <button
                  type="button"
                  onClick={() => void navigate(n.to)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-80"
                >
                  <Icon size={18} strokeWidth={2} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 text-[14px] text-ink">{n.text}</span>
                </button>
                <HoldToDelete
                  onDelete={() => setDismissed(dismissNotification(n.id))}
                  label="Удерживайте, чтобы убрать уведомление"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
