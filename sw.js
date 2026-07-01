// 都道府県チャンピオン Service Worker
const CACHE = "todofuken-champ-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./prefectures.js",
  "./geopolitics.js",
  "./generator.js",
  "./manifest.json",
  "./favicon.ico",
  "./icons/icon-16.png",
  "./icons/icon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// cache-first（オフライン対応）
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // ランキングAPIはキャッシュせず常にネットワークへ
  if (new URL(e.request.url).pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
