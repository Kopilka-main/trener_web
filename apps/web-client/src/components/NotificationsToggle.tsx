import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  disablePush,
  enablePush,
  isPushSupported,
  isSubscribed,
  notificationPermission,
} from '../lib/push';

/** Тумблер системных push-уведомлений. Включение требует жеста пользователя (тап). */
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
  const [note, setNote] = useState('');

  async function toggle() {
    setBusy(true);
    setNote('');
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        const res = await enablePush();
        setPerm(notificationPermission());
        if (res === 'enabled') setOn(true);
        else if (res === 'no-key') setNote('Push не настроен на сервере.');
        else if (res === 'denied' && notificationPermission() !== 'denied')
          setNote('Разрешение не выдано — нажмите ещё раз и подтвердите запрос.');
      }
    } catch {
      setNote('Не удалось включить уведомления. Попробуйте ещё раз.');
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
        role="switch"
        aria-checked={on}
        className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 active:bg-card-elevated disabled:opacity-60"
      >
        <span className="flex items-center gap-3">
          <Bell size={17} strokeWidth={1.9} className="text-ink-muted" />
          <span className="text-[14px] text-ink">Push-уведомления</span>
        </span>
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
            on ? 'bg-accent' : 'bg-chip'
          } ${busy ? 'opacity-60' : ''}`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
              on ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
      </button>
      {denied && (
        <p className="px-1 text-[12px] text-ink-muted">
          Уведомления запрещены — разрешите их для сайта в настройках браузера.
        </p>
      )}
      {note && !denied && <p className="px-1 text-[12px] text-ink-muted">{note}</p>}
    </div>
  );
}
