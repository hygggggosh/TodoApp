const CACHE = "muse-v6";
const V = "?v=6";
const ASSETS = [
  "./",
  "./index.html" + V,
  "./manifest.json",
  "./js/db.js" + V,
  "./js/tools.js" + V,
  "./js/agent.js" + V,
  "./js/providers.js" + V,
  "./js/llmAgent.js" + V,
  "./js/usage.js" + V,
  "./js/memoryExtractor.js" + V,
  "./js/app.js" + V,
  "./legacy/",
  "./legacy/index.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
          .catch(() => caches.match("./"))
    )
  );
});
