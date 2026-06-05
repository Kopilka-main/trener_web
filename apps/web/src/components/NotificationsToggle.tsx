import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  disablePush,
  enablePush,
  isPushSupported,
  isSubscribed,
  notificationPermission,
} from '../lib/push';

/** Тумблер системных push-уведомлений тренера. Включение требует жеста пользователя (тап). */
export function NotificationsToggle() {
  const [supported] = useState(() => isPushSupported());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    notificationPermission(),
  );

  useEffect(() => {
    if (supported) void isSubscribed().then(setOn);
  }, [supported]);

  if (!supported) {
    return (
      <p className="rounded-2xl bg-card px-4 py-3 text-[13px] text-ink-muted">
        Уведомления недоступны в этом браузере. На iPhone добавьте приложение на экран «Домой» и
        откройте его с иконки.
      </p>
    );
  }

  const denied = perm === 'denied';

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        const res = await enablePush();
        setPerm(notificationPermission());
        if (res === 'enabled') setOn(true);
      }
    } catch {
      // молча: статус не меняем, пользователь может повторить
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy || denied}
        className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 active:bg-card-elevated disabled:opacity-60"
      >
        <span className="flex items-center gap-3">
          <Bell size={17} strokeWidth={1.9} className="text-ink-muted" />
          <span className="text-[14px] text-ink">Push-уведомления</span>
        </span>
        <span
          className={`text-[13px] font-semibold ${on ? 'text-accent-text' : 'text-ink-mutedxl'}`}
        >
          {busy ? '…' : on ? 'Вкл' : 'Выкл'}
        </span>
      </button>
      {denied && (
        <p className="px-1 text-[12px] text-ink-muted">
          Уведомления запрещены — разрешите их для сайта в настройках браузера.
        </p>
      )}
    </div>
  );
}
