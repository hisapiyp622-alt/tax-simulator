// 手取りシミュレーター — service worker(キャッシュファースト・オフライン動作)
// ファイルを更新したら CACHE_NAME のバージョンと index.html 側の ?v=N を必ず上げること。
const CACHE_NAME = "tax-sim-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=1",
  "./app.js?v=1",
  "./tax.js?v=1",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        // 同一オリジンの成功レスポンスだけキャッシュに追加
        if (res.ok && new URL(event.request.url).origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
