const CACHE_NAME = 'speaker-design-tools-v9';

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
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
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

// Cache-first for the app shell, falling back to network (and caching the result)
// for anything else same-origin. Never intercept cross-origin requests.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
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
