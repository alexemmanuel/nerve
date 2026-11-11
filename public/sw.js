/**
 * Nerve Service Worker v1.0
 * Provides offline shell caching, background sync registration,
 * and automatic offline queue flush dispatch when online status transitions.
 */

const CACHE_NAME = 'nerve-sw-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[Nerve SW] Pre-cache partial fail (acceptable in dev):', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Broadcast a message to all open client windows
async function broadcastToClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// Background Sync listener: triggers when connectivity is regained
self.addEventListener('sync', (event) => {
  if (event.tag === 'nerve-flush-offline-queue') {
    event.waitUntil(
      broadcastToClients({
        type: 'NERVE_SW_BACKGROUND_SYNC',
        tag: event.tag,
        timestamp: Date.now(),
      })
    );
  }
});

// Periodic sync listener (where supported by browser)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'nerve-periodic-queue-check') {
    event.waitUntil(
      broadcastToClients({
        type: 'NERVE_SW_PERIODIC_SYNC',
        tag: event.tag,
        timestamp: Date.now(),
      })
    );
  }
});

// Client communication channel
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'PING') {
    if (event.source) {
      event.source.postMessage({ type: 'PONG', timestamp: Date.now() });
    }
  } else if (data.type === 'REQUEST_QUEUE_FLUSH_BROADCAST') {
    broadcastToClients({
      type: 'NERVE_TRIGGER_FLUSH',
      timestamp: Date.now(),
    });
  }
});
