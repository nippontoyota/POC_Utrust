// Minimal cache-shell service worker. This app is auth/session-driven, so it
// deliberately does NOT cache page responses -- stale role/auth state would
// be worse than no offline support. A registered fetch handler is what makes
// the app installable ("Add to Home Screen"); that's its only real job here.
const CACHE_NAME = "utrust-shell-v2";
const SHELL_ASSETS = ["/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !SHELL_ASSETS.includes(url.pathname)
  ) {
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
