import { z } from 'zod';

// Подписка браузера на Web Push (то, что отдаёт PushManager.subscribe()).
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushSubscribeRequestSchema = z.object({
  subscription: pushSubscriptionSchema,
});
export type PushSubscribeRequest = z.infer<typeof pushSubscribeRequestSchema>;

export const pushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().url(),
});
export type PushUnsubscribeRequest = z.infer<typeof pushUnsubscribeRequestSchema>;

// Публичный VAPID-ключ для PushManager.subscribe(). Пустая строка = push отключён на сервере.
export const pushVapidResponseSchema = z.object({
  publicKey: z.string(),
});
export type PushVapidResponse = z.infer<typeof pushVapidResponseSchema>;
