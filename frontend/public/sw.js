// =====================================================
// AZAREAN — Service Worker
// Стратегии: cache-first для статики, network-first для API
// =====================================================

// Бамп версии при изменении SW — `activate` снесёт все кеши с другим именем.
// v3 (2026-05-01) — CSS Modules + dark theme миграция, hashed class names
// в module.css изменили все JS bundle hash'и; старый кеш v2 подгружал stale
// JS без соответствующих CSS chunks → страницы рендерились без стилей.
// v4 (2026-05-15) — Wave 1 hot-fix batch (PR #61-#65): OAuth post-registration,
// complex.title UI, AdminContent CSS Modules, invite-code share UX. Прод-smoke
// показал что Telegram-share отдавал старый формат — это cache-first для JS
// (новый bundle.<hash>.js не подгружался, old hash в кэше). Bump v4 → activate
// очищает старый кеш → юзеры получают свежий index.html + новый bundle.
// v5 (2026-05-22) — Brand polish: favicon.ico пересобран из AN-logo.jpg
// (старый был дефолтный React), apple-touch-icon/logo192/logo512 регенерированы.
// Старые юзеры с PWA на главном экране получат новую иконку только после
// activate (которое очищает старый CACHE_NAME и форсит refetch манифеста).
// v6 (2026-05-22 vol.2) — Favicon swap: AN-logo.jpg → logo_az.png (clean A+AZAREAN
// monogram, 1024×1024 source, лучшая чёткость на 192/512). Bump для инвалидации
// иконок у пациентов с уже установленной PWA.
// v7 (2026-05-26) — Modal overlay hook + admin email-change UI + 4-волновый
// modal close-on-drag fix. SW v6 был агрессивный (Vadim видел stale bundle
// при тесте модального фикса, пришлось вручную Unregister + Clear site data).
// Bump → activate сам очистит старый CACHE_NAME у всех клиентов.
// v8 (2026-05-26) — Wave 3 LIVE: owner command center (C1–C5.4). Новые
// admin-роуты в SPA + новые frontend chunks (CommandCenter/Attention/Funnel/
// Segments/Dynamics/Instructors + InstructorModal). Без bump'а админ получит
// старый bundle без новой главной — урок feedback_sw_cache_bump_required.
// v9 (2026-05-28) — Audio-арк LIVE: AudioProvider+ProfileScreen sound
// settings (CP1), instructor authoring auto_complete+tempo (CP2a/b/c),
// ExerciseRunner per-set гайд для countdown + open-hold с авто-rest
// (CP3a.1/.2). Новые chunks: AudioContext, ExerciseRunner_CP3a, ui-cp3a
// mocks (только dev). Без bump'а пациенты с открытой PWA продолжат
// крутить старый count-up секундомер без countdown/звука/авто-rest.
// v10 (2026-05-28 vol.2) — UX-редизайн раннера CP3c.1+.2: ready-фаза с
// гейтом «Начать подход», 3-2-1 преролл (count_tick + set_start cue),
// PhaseRing 170px + цвет фаз (work=coral, rest=teal), новые
// .pd-phase-btn--start/--finish (видимые, не ghost). Новые chunks:
// ui/PhaseRing + PhaseRing.css. Без bump'а пациенты будут видеть
// плоский CP3a-таймер без гейта и старого стартового звука.
// v11 (2026-05-28 vol.3) — CP3c polish: «Начать подход» крупнее
// (56px min-height, 18px font, 16px radius, coral shadow для глубины),
// больше воздуха между кольцом и actions (20→8 ring margin + 24px
// actions margin-top), сужен max-width 320→280, gap 8→12. Tap-feedback
// scale(0.97). Без bump'а PWA-юзеры продолжали бы видеть «вытянутую
// маленькую плоскую» кнопку из v10.
// v12 (2026-05-29) — CP3d skip-rest: в rest-фазе появилась teal-outline
// кнопка «Пропустить отдых» (data-testid=skip-rest-btn). onClick
// переиспользует существующий handleRestComplete → phase=ready(k+1) +
// очистка rest-таймера. Ручной skip НЕ играет cue('rest_end') (звук
// живёт внутри RestTimer setInterval — при unmount через смену setPhase
// callback не запускается). POST не дёргается. Без bump'а пациенты с
// открытой PWA продолжат ждать полный отдых даже если готовы раньше.
// v13 (2026-05-29 vol.2) — CP3e skip-кнопка в семью: refactor PhaseRing.css
// в unified outline-селектор (--finish + --skip-rest делят геометрию через
// общий shared блок, различие сведено к цвету). До v13 архитектор увидел
// «bolted-on» вид на iPhone. CSS-only, без JS/логики. Без bump'а PWA
// продолжат видеть старую визуально-расходящуюся кнопку из v12.
const CACHE_NAME = 'azarean-v13';
const API_CACHE = 'azarean-api-v13';

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
