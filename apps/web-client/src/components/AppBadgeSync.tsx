import { useEffect } from 'react';
import { useClientChatUnread } from '../api/chat';
import { updateAppBadge } from '../lib/appBadge';

/** Пока приложение открыто — держит бейдж на иконке = числу непрочитанных сообщений. */
export function AppBadgeSync() {
  const unread = useClientChatUnread();
  useEffect(() => {
    updateAppBadge(unread.data ?? 0);
  }, [unread.data]);
  return null;
}
