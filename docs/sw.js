const OLD_ROOT_CACHE_PREFIXES = ["gpx-iphone-test-offline-v1-"];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => OLD_ROOT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim()),
  );
});
