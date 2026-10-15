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

// Case-assignment push notifications (new case for a PTL to assign, new case
// assigned to a PO). Payload is always { title, body, url } JSON -- see
// src/lib/push.server.ts.
self.addEventListener("push", (event) => {
  let data = { title: "UTrust", body: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload -- fall back to the default title/body above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo.png",
      badge: "/logo.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).pathname === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
