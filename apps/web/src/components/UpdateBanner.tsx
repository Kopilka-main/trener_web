import { useEffect, useState } from 'react';
import { startUpdateWatcher } from '../lib/appVersion';

/** Баннер «вышла новая версия» — появляется при деплое, перезагружает на свежий код. */
export function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => startUpdateWatcher(() => setShow(true)), []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-between gap-3 bg-accent px-4 py-3 text-accent-on shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
      <span className="text-[14px] font-semibold">Доступна новая версия</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-full bg-accent-on/15 px-4 py-1.5 text-[13px] font-bold active:bg-accent-on/25"
      >
        Обновить
      </button>
    </div>
  );
}
