/* SalonHub Notification Service Worker
 *
 * Lightweight SW that lets the page show OS-level notifications
 * even when the tab is backgrounded / minimised. Avoids any external
 * push provider (no FCM / VAPID needed).
 *
 * The page sends notifications via:
 *   navigator.serviceWorker.controller.postMessage({
 *     type: 'show-notification',
 *     title, body, tag, url
 *   })
 *
 * On notification click, the SW focuses the existing tab (or opens one).
 */

// Desktop app (installed SalonHub): when a page can't load because the
// device is offline, show a branded offline screen instead of the browser's
// error page. Only page navigations are handled; everything else (API calls,
// assets) goes straight to the network untouched.
const OFFLINE_CACHE = 'salonhub-offline-v1';
const OFFLINE_ASSETS = ['/offline.html', '/icons/salon-icon-192.png'];

self.addEventListener('install', (event) => {
  // Activate immediately so the very first registration can post messages.
  self.skipWaiting();
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)).catch(() => {})
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode === 'navigate' && req.method === 'GET') {
    // Revalidate the page with the server (a cheap 304 when online) so a stale
    // copy in the HTTP cache is never shown while offline.
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .catch(() => caches.match('/offline.html'))
    );
  } else if (req.url.endsWith('/icons/salon-icon-192.png')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
  }
});

self.addEventListener('activate', (event) => {
  // Take control of all uncontrolled clients (existing pages) right away.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'show-notification') {
    const title = data.title || 'SalonHub';
    const body = data.body || '';
    const tag = data.tag || 'salonhub';
    const url = data.url || '/';
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        tag,
        icon: '/icons/salon-icon-192.png',
        badge: '/icons/salon-icon-192.png',
        requireInteraction: !!data.requireInteraction,
        data: { url },
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      // Try focusing an existing window
      for (const client of clientsArr) {
        try {
          if ('focus' in client) {
            client.focus();
            // Navigate the focused client to the target URL
            if ('navigate' in client && targetUrl) {
              try { client.navigate(targetUrl); } catch (e) { /* ignore */ }
            }
            return;
          }
        } catch (e) { /* ignore */ }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
