const CACHE_NAME   = 'curio-v6';
const SHELL_ASSETS = ['/style.css', '/app.js', '/manifest.json'];

// Install — cache static assets only (not HTML)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate — delete all old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate';
  const isAPI        = url.pathname.startsWith('/api/') ||
                       url.hostname.includes('render.com') ||
                       url.hostname.includes('onrender.com');

  // HTML navigation — ALWAYS network-first, no caching
  // This is the key fix: every time the tab opens, it fetches fresh HTML
  // so JavaScript runs from scratch, pageshow fires correctly,
  // and the refresh logic executes reliably
  if (isNavigation) {
    event.respondWith(
      fetch(event.request).catch(() =>
        // Only fall back to cache if completely offline
        caches.match('/index.html')
      )
    );
    return;
  }

  // API calls — always network, never cache
  if (isAPI) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets (CSS, JS, fonts) — cache-first, fast
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && !url.hostname.includes('google')) {
          caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
        }
        return response;
      });
    })
  );
});
