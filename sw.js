// バージョンを変えるときはここを書き換えるだけでOKになります
const CACHE_NAME = 'tot-logger-v55'; 

const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
  // Adobe Fontsなどの外部URLはここには含めません（ネットワーク経由で取得します）
];

// インストール処理
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // ★重要: インストール直後に待機状態をスキップし、即座に稼働させる
        return self.skipWaiting();
      })
  );
});

// アクティブ化処理（古いキャッシュの削除）
self.addEventListener('activate', function(event) {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      // ★重要: 即座にページをコントロール下に置く（リロード不要で反映されやすくする）
      return self.clients.claim();
    })
  );
});

// フェッチ処理（オフライン対応 + ネットワーク優先の戦略へ変更も検討可能だが、今回はキャッシュ優先のまま）
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // キャッシュにあればそれを返す
        if (response) {
          return response;
        }
        // なければネットワークに取りに行く
        return fetch(event.request);
      })
  );
});