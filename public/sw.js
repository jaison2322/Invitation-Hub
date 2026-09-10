// Service Worker for VIP Event Intelligence PWA & Mobile Notifications
const SW_VERSION = '1.0.1';

self.addEventListener('install', (event) => {
  // Activate worker immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push notifications (when app is in background or closed)
self.addEventListener('push', (event) => {
  let data = {
    title: 'VIP Intelligence Alert',
    body: 'You have a new VIP event update.',
    actionUrl: '/notifications',
    tag: 'vip-notification-' + Date.now(),
  };

  try {
    if (event.data) {
      const json = event.data.json();
      data = { ...data, ...json };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon.png',
    badge: '/favicon.svg',
    tag: data.tag || 'vip-notification',
    data: {
      actionUrl: data.actionUrl || '/notifications',
    },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click on mobile/desktop
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const actionUrl = (event.notification.data && event.notification.data.actionUrl) || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window open with this app
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && actionUrl) {
            client.navigate(actionUrl);
          }
          return;
        }
      }
      // If no window is open, open a new window to the target URL
      if (self.clients.openWindow) {
        return self.clients.openWindow(actionUrl);
      }
    })
  );
});

// Handle message from client (safely invokes showNotification via service worker on mobile browsers)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, actionUrl, id } = event.data;
    const options = {
      body: body || '',
      icon: '/icon.png',
      badge: '/favicon.svg',
      tag: 'vip-notif-' + (id || Date.now()),
      data: {
        actionUrl: actionUrl || '/notifications',
      },
      vibrate: [200, 100, 200],
      requireInteraction: false,
      renotify: true,
    };

    event.waitUntil(
      self.registration.showNotification(title || 'VIP Intelligence Alert', options)
    );
  }
});
