// Browsers don't reliably check for a changed service-worker.js on every
// navigation - by spec it's throttled (effectively up to 24h unless asked
// to check sooner), so without an explicit update() call here, clicking
// between pages after a deploy could keep running the old worker (and so
// the old cached JS/CSS) far longer than the network-first HTML fetch
// alone would suggest. Calling update() on every load, plus whenever the
// tab regains focus, keeps that gap small instead of relying on a hard
// reload to force it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        registration.update();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update();
        });
      })
      .catch((err) => {
        console.error('Service worker registration failed:', err);
      });
  });
}
