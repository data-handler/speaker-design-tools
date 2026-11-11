const CACHE_NAME = 'speaker-design-tools-v13';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/css/app.css',
  '/vendor/fonts/jetbrains-mono-latin-400-normal.woff2',
  '/vendor/fonts/jetbrains-mono-latin-700-normal.woff2',
  '/vendor/fonts/public-sans-latin-400-normal.woff2',
  '/vendor/fonts/public-sans-latin-500-normal.woff2',
  '/vendor/fonts/public-sans-latin-700-normal.woff2',
  '/vendor/redom/redom.es.min.js',
  '/vendor/uplot/uPlot.esm.js',
  '/vendor/uplot/uPlot.min.css',
  '/src/register-sw.js',
  '/src/diffraction.js',
  '/src/sealed-box.js',
  '/src/vented-box.js',
  '/src/chart-theme.js',
  '/src/complex.js',
  '/src/measurement-import.js',
  '/src/resample.js',
  '/src/crossover-network.js',
  '/src/driver-combine.js',
  '/src/crossover-presets.js',
  '/src/directivity.js',
  '/src/project-library.js',
  '/src/project-library-panel.js',
  '/tools/diffraction/',
  '/tools/diffraction/index.html',
  '/tools/diffraction/main.js',
  '/tools/box/',
  '/tools/box/index.html',
  '/tools/box/main.js',
  '/tools/crossover/',
  '/tools/crossover/index.html',
  '/tools/crossover/main.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// HTML documents (page navigations) are network-first, falling back to the
// cache only when offline: skipWaiting()/clients.claim() above make a new
// service worker take over promptly, but with a plain cache-first fetch
// handler that still isn't enough on its own, since a navigation already
// served from an old, still-controlling worker's cache would never see the
// new HTML until that worker itself updates - genuinely new content (like a
// new tool's card on the homepage) could sit behind a page's own in-app
// links indefinitely, only fixed by a hard reload. Everything else
// (JS/CSS/fonts/vendor libs) stays cache-first: those are already
// cache-busted by CACHE_NAME, so there's no staleness risk, and cache-first
// is what makes the app usable offline. Never intercept cross-origin
// requests.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
