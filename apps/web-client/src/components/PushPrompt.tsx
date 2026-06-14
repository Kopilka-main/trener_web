import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { enablePush, isPushSupported, notificationPermission } from '../lib/push';

const KEY = 'push-prompt-pending';

function clearPending() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // нет доступа к storage — не критично
  }
}

/** Приглашение включить push сразу после регистрации (флаг push-prompt-pending).
 * Показываем только когда пуш поддерживается и разрешение ещё не запрашивалось. */
export function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let pending = false;
    try {
      pending = localStorage.getItem(KEY) === '1';
    } catch {
      // storage недоступен — оставляем false
    }
    if (!pending) return;
    if (isPushSupported() && notificationPermission() === 'default') setShow(true);
    else clearPending();
  }, []);

  function dismiss() {
    clearPending();
    setShow(false);
  }

  async function enable() {
    setBusy(true);
    try {
      await enablePush();
    } catch {
      // молча — пользователь сможет включить позже в профиле
    } finally {
      setBusy(false);
      dismiss();
    }
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-5"
      role="dialog"
      aria-modal="true"
      aria-label="Включить уведомления"
    >
      <div className="w-full max-w-sm rounded-2xl bg-card p-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent-text">
            <Bell size={24} strokeWidth={2} />
          </span>
          <h2 className="text-[17px] font-bold text-ink">Включить уведомления?</h2>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Чтобы не пропускать сообщения от тренера и напоминания о тренировках, разрешите
            push-уведомления.
          </p>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className="rounded-xl bg-accent py-3 text-[15px] font-semibold text-accent-on active:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Включаем…' : 'Включить'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="rounded-xl py-2.5 text-[14px] font-semibold text-ink-muted active:opacity-70"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
