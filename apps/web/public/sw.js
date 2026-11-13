// JobPilot service worker: Web Push only (no offline caching).
// Payload from the worker job `push.pack-ready`: { title, body, url, tag }.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = { title: 'JobPilot', body: 'Something is ready for you.', url: '/today', tag: 'jobpilot' };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // Not JSON: keep the defaults.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/today', self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const same = windows.find((w) => new URL(w.url).origin === url.origin);
      if (same) {
        await same.focus();
        return same.navigate(url.href);
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});
