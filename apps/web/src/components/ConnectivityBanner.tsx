import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnline } from '../lib/connectivity';

/** Сколько держать зелёную плашку «соединение восстановлено», мс. */
const RESTORED_MS = 2500;

/**
 * Маленькая плашка статуса связи поверх контента:
 *  • нет связи — янтарная «Не удаётся соединиться, проверьте интернет» (висит, пока нет);
 *  • связь вернулась — лаймовая «Соединение восстановлено» (на пару секунд, затем скрывается).
 * Статус определяется по сетевым сбоям fetch (см. lib/connectivity).
 */
export function ConnectivityBanner() {
  const online = useOnline();
  const [showRestored, setShowRestored] = useState(false);
  const prevOnline = useRef(online);

  useEffect(() => {
    if (prevOnline.current === false && online) {
      setShowRestored(true);
      const id = window.setTimeout(() => setShowRestored(false), RESTORED_MS);
      prevOnline.current = online;
      return () => window.clearTimeout(id);
    }
    prevOnline.current = online;
    if (!online) setShowRestored(false);
    return undefined;
  }, [online]);

  if (online && !showRestored) return null;

  const offline = !online;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div
        role="status"
        className={`pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold shadow-lg ${
          offline ? 'bg-amber text-[#1a1200]' : 'bg-accent text-accent-on'
        }`}
      >
        {offline ? (
          <WifiOff size={15} strokeWidth={2.2} className="shrink-0" />
        ) : (
          <Wifi size={15} strokeWidth={2.2} className="shrink-0" />
        )}
        <span>
          {offline ? 'Не удаётся соединиться. Проверьте интернет' : 'Соединение восстановлено'}
        </span>
      </div>
    </div>
  );
}
