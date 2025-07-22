const CACHE_NAME = "stringalgebra-v1";
const ASSETS = [
  "./",                // root
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./favicon.png"
];

// INSTALL: Cache all core assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => console.error("SW install failed:", err))
  );
});

// ACTIVATE: Remove old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    )
  );
});

// FETCH: Respond from cache first, then network
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      })
  );
});
