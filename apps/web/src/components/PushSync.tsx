import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Мгновенное обновление по web push: service worker (sw.js) при получении пуша
 * шлёт окнам postMessage({ type: 'push' }). Здесь ловим его и инвалидируем все
 * активные запросы — счётчик непрочитанных, плитки и уведомления обновляются
 * сразу (как бейдж на иконке), без ожидания периодического опроса.
 */
export function PushSync() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string } | null;
      if (data?.type === 'push') {
        void qc.invalidateQueries();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [qc]);
  return null;
}
