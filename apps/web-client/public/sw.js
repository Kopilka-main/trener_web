/* eslint-disable */
// Service Worker клиентского приложения «Мой тренер».
// Назначение: приём web push и показ системного уведомления, переход по тапу.
// Никакого кэширования (нет fetch-обработчика) — на загрузку приложения не влияет.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || 'Мой тренер';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'trener',
    data: { url: data.url || '/' },
  };
  // Счётчик на иконке приложения (App Badging), если сервер прислал число.
  if (typeof data.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    try {
      self.navigator.setAppBadge(data.badge);
    } catch (e) {}
  }
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
