/* SumScale Web Push Notification Service Worker */

self.addEventListener('push', (event) => {
  let payload = {
    title: '🔔 SumScale Notification',
    body: 'You have a new update in SumScale.',
    icon: '/favicon.ico',
    url: '/profile?tab=reminders',
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      url: payload.url || '/dashboard',
    },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'View in SumScale' },
      { action: 'close', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
