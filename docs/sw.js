const CACHE_NAME = "gpx-iphone-test-offline-v1-2026-05-30T170000z0000";
const CACHE_PREFIX = "gpx-iphone-test-offline-v1-";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/styles.css",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./data/route.json",
  "./data/pois.json",
  "./data/gaps.json",
  "./data/segments.json",
  "./data/app-meta.json",
  "./assets/rider-marker.png",
  "./assets/rider-marker@2x.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") return caches.match("./index.html");
          return new Response("Offline asset not cached", { status: 503, statusText: "Offline" });
        });
    }),
  );
});
