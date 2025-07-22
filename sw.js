// service-worker.js - StringAlgebra PWA v0.1

const CACHE_NAME = "stringalgebra-v0.1";
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
  console.log("[SW] Install event");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("[SW] Caching core assets");
        return cache.addAll(ASSETS);
      })
      .catch(err => console.error("[SW] Install failed:", err))
  );
});

// ACTIVATE: Clean up old caches
self.addEventListener("activate", event => {
  console.log("[SW] Activate event");
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log("[SW] Deleting old cache:", key);
              return caches.delete(key);
            })
      )
    )
  );
});

// FETCH: Cache-first strategy
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          console.log("[SW] Serving from cache:", event.request.url);
          return response;
        }
        console.log("[SW] Fetching from network:", event.request.url);
        return fetch(event.request);
      })
      .catch(err => {
        console.warn("[SW] Fetch failed:", err);
        // Offline fallback for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      })
  );
});
