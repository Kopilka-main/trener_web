/* eslint-disable */
// Service Worker тренерского приложения «Тренер».
// Назначение: приём web push и показ системного уведомления, переход по тапу.
// Никакого кэширования (нет fetch-обработчика) — на загрузку приложения не влияет.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || 'Тренер';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'trener',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(url).catch(() => {});
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
