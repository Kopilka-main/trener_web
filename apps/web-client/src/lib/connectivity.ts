import { useSyncExternalStore } from 'react';

// Глобальный признак связи с API. true — последний сетевой запрос прошёл (или
// устройство online); false — последний fetch отклонился (нет интернета/сервер
// недоступен). HTTP-ошибки (4xx/5xx) сюда НЕ относятся — сервер достижим.

let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Пометить связь установленной (успешный запрос или событие online). */
export function markOnline(): void {
  if (online) return;
  online = true;
  emit();
}

/** Пометить связь потерянной (сетевой сбой fetch или событие offline). */
export function markOffline(): void {
  if (!online) return;
  online = false;
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): boolean {
  return online;
}

// Системные события сети — мгновенный сигнал, дополняет детект по fetch.
if (typeof window !== 'undefined') {
  window.addEventListener('online', markOnline);
  window.addEventListener('offline', markOffline);
}

/** Подписка на статус связи (true — есть, false — нет). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
