self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("orderflow-shell-v2").then((cache) => cache.addAll(["/"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== "orderflow-shell-v2").map((key) => caches.delete(key))),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/backend") || url.pathname.startsWith("/api") || url.pathname.startsWith("/_next")) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((hit) => hit || caches.match("/"))),
  );
});
