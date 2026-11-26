/* Service Worker：讓加入主畫面的網頁 App 在離線時也能開啟
 * - 頁面：網路優先（有網路時永遠拿最新版），離線時用快取
 * - 圖示等本地檔案：先用快取，背景更新
 * - 國旗圖片：快取，離線也能顯示
 * - 匯率 API 與 data/*.json：不經過快取（網頁本身已有快取與備援機制）
 * 修改此檔或想強制更新快取時，把 VERSION 改一個數字即可。
 */
const VERSION = 'v1';
const SHELL = `fx-shell-${VERSION}`;
const FLAGS = 'fx-flags';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('fx-shell-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 頁面本身：網路優先，4 秒逾時改用快取
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(req), timeout(4000)]);
        if (res.ok) { const c = await caches.open(SHELL); c.put('./index.html', res.clone()); }
        return res;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // 國旗：快取優先
  if (url.hostname === 'flagcdn.com') {
    e.respondWith((async () => {
      const c = await caches.open(FLAGS);
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch { return Response.error(); }
    })());
    return;
  }

  // 本站靜態檔（不含 data/ 匯率資料）：快取優先、背景更新
  if (url.origin === location.origin && !url.pathname.includes('/data/')) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});
