const CACHE_VERSION = 'v1';
const CACHE_NAME = `dmc08-${CACHE_VERSION}`;

// SW のスコープ（GitHub Pages サブパス /duelmasters-classic08-database/）を基準に解決する
const SCOPE = new URL(self.registration.scope);

// 必須 app shell（1件でも失敗したら install を中断する）
const PRECACHE_REQUIRED = [
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
].map((p) => new URL(p, SCOPE).toString());

// 任意（失敗してもキャッシュをベストエフォートで埋める）
const PRECACHE_OPTIONAL = [
  './',
  './meta.html',
  './ogp.png',
  './icons/icon-180.png',
  './icons/icon-512-maskable.png',
].map((p) => new URL(p, SCOPE).toString());

const PRECACHE_URLS = [...PRECACHE_REQUIRED, ...PRECACHE_OPTIONAL];

// stale-while-revalidate 対象（スコープ基準の絶対 URL）
const SWR_URLS = [
  './cards.json',
  './data/hall-of-fame.json',
  './data/recipes.json',
  './data/meta-decks.json',
].map((p) => new URL(p, SCOPE).toString());

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_REQUIRED).then(() =>
        Promise.allSettled(PRECACHE_OPTIONAL.map((url) => cache.add(url).catch(() => {})))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => cached || fetch(request));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 同一オリジン外（外部CDN・画像ホスト等）はパススルー
  if (url.origin !== SCOPE.origin) return;

  // スコープ外（別アプリ等）はパススルー
  if (!url.pathname.startsWith(SCOPE.pathname)) return;

  const href = url.toString();

  // SWR 対象データ
  if (SWR_URLS.includes(href)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // プリキャッシュ対象（app shell）
  if (PRECACHE_URLS.includes(href)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 個別カード/レシピページ（./card/, ./recipe/）は事前キャッシュしないパススルー。
  // ただしオフライン時のナビゲーションは SPA シェルにフォールバックさせる。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(new URL('./index.html', SCOPE).toString()))
    );
    return;
  }

  // それ以外はネットワーク優先、失敗時のみキャッシュを試みる
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
