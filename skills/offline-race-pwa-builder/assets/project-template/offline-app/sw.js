const CACHE_NAME = "raid-radar-template-offline-v1-2026-05-30T192214z0000";
const CACHE_PREFIX = "raid-radar-template-offline-v1-";
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
  "./assets/raid-radar-logo.svg",
  "./assets/rider-marker.png",
  "./assets/rider-marker@2x.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png"
];
const NETWORK_FIRST_ASSETS = new Set(["./", "./index.html", "./manifest.webmanifest", "./src/app.js", "./src/styles.css"]);

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

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  const networkFirst = event.request.mode === "navigate" || NETWORK_FIRST_ASSETS.has(relativeAssetPath(requestUrl));
  event.respondWith(networkFirst ? networkFirstFetch(event.request) : cacheFirstFetch(event.request));
});

function relativeAssetPath(requestUrl) {
  const scopePath = new URL(self.registration.scope).pathname;
  if (!requestUrl.pathname.startsWith(scopePath)) return "";
  const relative = requestUrl.pathname.slice(scopePath.length);
  return relative ? `./${relative}` : "./";
}

async function networkFirstFetch(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return caches.match("./index.html");
    return new Response("Offline asset not cached", { status: 503, statusText: "Offline" });
  }
}

async function cacheFirstFetch(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (request.mode === "navigate") return caches.match("./index.html");
    return new Response("Offline asset not cached", { status: 503, statusText: "Offline" });
  }
}
