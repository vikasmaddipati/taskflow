// TaskFlow Production Service Worker — Offline Shell & API Cache Fallback
const CACHE_NAME = 'taskflow-static-v4';
const API_CACHE_NAME = 'taskflow-api-cache-v4';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== API_CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignore non-GET, non-HTTP(S), and cross-origin requests
  if (
    event.request.method !== 'GET' ||
    !url.protocol.startsWith('http') ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Handle HTML document navigation — ALWAYS Network First so users get latest deployed builds
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallbackRoot = await caches.match('/');
          if (fallbackRoot) return fallbackRoot;
          const fallbackIndex = await caches.match('/index.html');
          if (fallbackIndex) return fallbackIndex;
          return new Response(
            '<!doctype html><html><head><meta charset="utf-8"><title>TaskFlow - Offline</title></head><body><h1>You are offline</h1><p>Please check your internet connection and reload.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // Handle tasks API GET requests (network first with offline cache fallback)
  if (url.pathname.includes('/api/tasks') || url.pathname.includes('/api/v1/tasks')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(event.request, copy);
            });
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ success: false, offline: true, message: 'Network unavailable' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Never cache or intercept other API / SSE endpoints
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) {
    return;
  }

  // Static assets (hashed JS, CSS, images): stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => cached || Response.error());

      return cached || fetchPromise;
    })
  );
});
