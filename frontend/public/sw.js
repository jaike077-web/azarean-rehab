// =====================================================
// AZAREAN — Service Worker
// Стратегии: cache-first для статики, network-first для API
// =====================================================

// Бамп версии при изменении SW — `activate` снесёт все кеши с другим именем.
const CACHE_NAME = 'azarean-v2';
const API_CACHE = 'azarean-api-v2';

// Файлы для предкэширования (app shell)
const PRECACHE_URLS = [
  '/',
  '/patient-login',
  '/manifest.json',
];

// =====================================================
// INSTALL — кэшируем app shell
// =====================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// =====================================================
// ACTIVATE — удаляем старые кэши
// =====================================================
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, API_CACHE];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => !currentCaches.includes(name))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// =====================================================
// FETCH — стратегии кэширования
// =====================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Пропускаем не-GET запросы
  if (request.method !== 'GET') return;

  // Пропускаем chrome-extension и другие протоколы
  if (!url.protocol.startsWith('http')) return;

  // API запросы → network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Статика (JS, CSS, изображения, шрифты) → cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Навигация (HTML страницы) → network-first с fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Всё остальное → network-first
  event.respondWith(networkFirst(request, CACHE_NAME));
});

// =====================================================
// СТРАТЕГИИ
// =====================================================

// Cache-first: сначала кэш, потом сеть (для статики)
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline — ничего не можем сделать
    return new Response('Offline', { status: 503 });
  }
}

// Network-first: сначала сеть, потом кэш (для API и навигации)
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'Нет подключения к сети' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Network-first для навигации с fallback на кэшированную страницу
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Пробуем вернуть кэш текущего URL
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback: вернуть кэшированную главную страницу (SPA)
    const fallback = await caches.match('/');
    if (fallback) return fallback;

    return new Response(
      '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#4A5568;text-align:center"><div><div style="font-size:48px;margin-bottom:16px">📡</div><h1>Нет подключения</h1><p>Проверьте интернет-соединение и попробуйте снова</p></div></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// =====================================================
// УТИЛИТЫ
// =====================================================

function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|svg|gif|ico|woff|woff2|ttf|eot)$/i.test(pathname)
    || pathname.startsWith('/static/');
}
