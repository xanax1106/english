/* ============================================================
 * 每日英文口說練習 — Service Worker
 * 更新程式後，把下面的 CACHE_VERSION 改成新的版本號再上傳
 * （網路優先，所以不改也會抓到新版；改版本號可順便清掉舊快取）
 * ============================================================ */
const CACHE_VERSION = "v2026.11.19-1";

const CACHE_PREFIX = "speak20-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const NET_TIMEOUT = 4000;   // 網路超過 4 秒沒回應，先用快取顯示
const CORE = ["./", "./index.html", "./manifest.json", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

// 安裝：預先快取核心檔案（個別失敗不影響安裝），並立即接手
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// 啟用：只刪除本程式舊版本的網頁快取（speak20- 開頭）
// 注意：Cache Storage 與 localStorage 是不同的儲存區，這裡完全不會動到學習紀錄
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 取得資源：同網站的 GET 一律「網路優先」，離線或逾時才用快取；外部網站（翻譯、字典）不經手
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  // cache: "no-store" 略過瀏覽器的 HTTP 快取（GitHub Pages 預設快取約 10 分鐘），確保拿到最新版
  const net = fetch(req.url, { cache: "no-store", credentials: "same-origin" })
    .then(res => {
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone()).catch(() => {});
      return res;
    });
  const cached = () => cache.match(req, { ignoreSearch: true })
    .then(r => r || (req.mode === "navigate"
      ? cache.match("./index.html").then(x => x || cache.match("./"))
      : undefined));

  try {
    const timer = new Promise(resolve => setTimeout(() => resolve("timeout"), NET_TIMEOUT));
    const first = await Promise.race([net, timer]);
    if (first !== "timeout") return first;
    const c = await cached();          // 網路太慢：有快取先顯示，網路回來後仍會更新快取
    return c || await net;
  } catch (e) {
    const c = await cached();          // 離線：回退快取
    if (c) return c;
    return new Response("目前離線，且尚未快取這個頁面。請連上網路後再開啟一次。", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}
