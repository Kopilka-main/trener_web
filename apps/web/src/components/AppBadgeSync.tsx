import { useEffect } from 'react';
import { useChatUnread } from '../api/chat';
import { updateAppBadge } from '../lib/appBadge';

/** Пока приложение открыто — держит бейдж на иконке = числу диалогов с непрочитанными. */
export function AppBadgeSync() {
  const unread = useChatUnread();
  useEffect(() => {
    updateAppBadge(unread.data ?? 0);
  }, [unread.data]);
  return null;
}
