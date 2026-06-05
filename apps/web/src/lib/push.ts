import { pushVapidResponseSchema } from '@trener/shared';
import { apiFetch } from '../api/client';

const SW_URL = '/sw.js';

/** Поддерживает ли окружение web push. На iOS — только в установленном на «Домой» PWA. */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

// VAPID-ключ (base64url) → Uint8Array для applicationServerKey.
// Явный ArrayBuffer — чтобы тип был BufferSource-совместим (не ArrayBufferLike).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? (await navigator.serviceWorker.register(SW_URL));
}

/** Регистрирует SW при загрузке приложения (без запроса разрешений). Тихо при ошибке. */
export async function registerPushServiceWorker(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    await navigator.serviceWorker.register(SW_URL);
  } catch {
    // SW не критичен для работы приложения — молча игнорируем.
  }
}

export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  return (await reg.pushManager.getSubscription()) !== null;
}

export type EnableResult = 'enabled' | 'denied' | 'unsupported' | 'no-key';

/** Запрашивает разрешение (нужен жест пользователя), подписывается и шлёт подписку на сервер. */
export async function enablePush(): Promise<EnableResult> {
  if (!isPushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const { publicKey } = await apiFetch('/push/vapid', { schema: pushVapidResponseSchema });
  if (publicKey === '') return 'no-key';

  const reg = await getRegistration();
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = sub.toJSON();
  await apiFetch('/push/subscribe', {
    method: 'POST',
    body: {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      },
    },
  });
  return 'enabled';
}

/** Отписывает устройство и убирает подписку с сервера. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await apiFetch('/push/unsubscribe', {
    method: 'POST',
    body: { endpoint: sub.endpoint },
  }).catch(() => undefined);
  await sub.unsubscribe();
}
