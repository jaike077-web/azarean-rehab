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
// v14 (2026-05-29 vol.3) — DA1 раннер таймер-зона по утверждённому макету:
//   * ready-кольцо приглушённо-коралл track (opacity 0.20) + БЕЗ progress-дуги
//   * RestTimer контролы (Reset/Pause/Play) → subdued teal-tint круги мельче,
//     без shadow (де-акцент)
//   * skip-rest расщеплён с finish: skip = solid teal forward-action,
//     finish = тихая outline coral (клинически тихая)
//   * rest-actions gap 24→32 (skip не прилипает к subdued RestTimer-контролам)
//   * PhaseRing цифра — tabular-nums (анти-джиттер при счёте)
// CSS-only (PhaseRing.css + RestTimer.css), ExerciseRunner.js не тронут.
// Без bump'а PWA продолжат видеть pre-DA1 палитру и outline-skip из v13.
// v15 (2026-05-29 vol.4) — DA2 добивка таймер-зоны под language-эталон:
//   * Контекстная шапка (phase-label testid): ready→«цель M:SS»,
//     countdown→«осталось», open-hold→«удержание», rest→«ОТДЫХ» + «до подхода N+1»
//   * Presets 30s/1:00/1:30/2:00 в auto-rest скрыты (hidePresets prop),
//     остаются только в рep-only ручном режиме
//   * Кнопки full-width: снят max-width:280 в .pd-phase-actions
//   * Унификация колец: RestTimer 200→170 (= PhaseRing для консистентности фаз)
// JSX: новый testid phase-label / phase-context-label (заменили set-indicator),
// логика advance/submit/POST не тронуты.
// v16 (2026-05-29 vol.5) — DA2.x узкий spacing fix: gap кольцо↔кнопка
// унифицирован 24→32 во всех фазах (.pd-phase-actions margin-top).
// DA1 override на [data-testid="auto-rest-block"] снят — стал дублем
// базы. Без bump'а пациенты продолжат видеть «прилипшую» кнопку из v15
// в ready/work фазах (rest уже имел 32 через DA1 override).
// v17 (2026-05-29 vol.6) — DA2.y: gap 32 → 48 после смоука v16. На iPhone
// 32 + margin-collapse с .pd-phase-ring margin-bottom 8 → visible 32px
// юзер всё ещё видел «прилипшую». 48 даёт однозначный визуальный воздух.
// v18 (2026-05-29 vol.7) — DA2.z: ROOT CAUSE найден через multi-agent
// workflow w1dibjuew. PatientDashboard.css:2278 содержит universal reset
// `.pd-runner * { margin: 0; padding: 0; box-sizing: border-box }` из
// LOCKED ExerciseRunner v4 iOS-эталона. Specificity (0,1,0) равна
// .pd-phase-actions, но reset загружается ПОЗЖЕ в каскаде → побеждает.
// Все margin'ы (24/32/48) на .pd-phase-actions без префикса зануливались.
// Fix: префикс .pd-runner на ВСЕ селекторы в PhaseRing.css и RestTimer.css
// → bump specificity (0,1,0)→(0,2,0). Перебивает reset во всех правилах.
// Тем самым воздух кольцо↔кнопка, paddings RestTimer'а и presets, паддинг
// .pd-phase-btn — всё применяется впервые с момента CP3c (когда добавили
// .pd-runner * reset, видимо). До v18 пациенты видели прилипшие кнопки
// в ready/work/rest, нулевой padding кнопок, и .pd-rest-timer без paddings.
// v19 (2026-05-29 vol.8) — URL-state роутинг: текущий экран пациента
// (?screen=) и вкладка инструктора (?tab=) сохраняются в URL (F5 не
// сбрасывает, работают «назад/вперёд», экран шарится ссылкой). Новый
// hooks/useUrlState.js + правки PatientDashboard/Dashboard/Patients →
// новый JS-бандл, нужен bump для инвалидации старого кэша у PWA-юзеров.
// v20 (2026-05-29 vol.9) — WARN pre-end бипы: cue('count_tick') когда
// отсчёт достигает 10 и 5 секунд в work-countdown (auto_complete=true) и
// в rest-таймере (авто per-set + ручной preset). Count-up (open-hold) и
// фазы ≤5с молчат. set_end/rest_end на 0 — без изменений. Правки
// ExerciseRunner.js + ui/RestTimer.js (новый JS-бандл) — нужен bump,
// иначе PWA-юзеры не получат предупреждающие бипы. (Архитектор писал TZ
// на базе SW v18; v19 уже занят URL-роутингом PR #71 → этот bump v19→v20.)
// v21 (2026-05-31) — Custom Audio админ-слой AA4/AA5: вкладка «Звуки» в
// AdminContent, секция «Звуки комплекса» в Create/EditComplex, средний
// слой cue-resolution в AudioContext (program-ярус). Новый JS-бандл → bump.
// v22 (2026-06-01) — ARC-CYCLE микроцикл влит в прод поверх audio (a9ea058):
// пациентский D2-сплит «Упражнения» — hero-карточки гимнастика/тренировка +
// block_complex_ids (будущие дни ротации не протекают в «Другие»); advance
// ротации День А/Б; командный центр с ДВУМЯ осями адхеренса (FunnelPanel
// «Приверженность» + InstructorModal); редактор блоков (селектор ВСЕХ комплексов
// пациента, фикс потери дня). Новый JS-бандл (admin + patient).
// v23 (2026-06-01) — UI-фиксы: восстановлены стили модалки «Состав комплекса»
// (MyComplexes — потеряны при CSS Modules миграции) + кнопка прослушки ▶ звука
// в дом-карте и секции «Звуки комплекса» (общий хук useAudioPreview). Новый бандл.
// v24 (2026-06-01) — ▶ для «Стандартного тона» теперь синтезирует сам тон события
// (getCueConfig, 1:1 как раннер) — раньше кнопка была неактивна. Новый бандл.
// v25 (2026-06-02) — Exercise Audio (EA1–EA6): длинный трек (музыка/голос/медитация)
// на упражнение — admin грузит/привязывает (ExerciseModal + per-row в редакторе
// комплекса + вкладка «Треки» в Звуках), раннер играет ВЕСЬ период упражнения поверх
// cue-бипов (отдельная громкость в Профиле). Новый JS-бандл (admin + patient).
// v26 (2026-06-02) — EA5 hotfix: трек упражнения играет в фазе 'work' (не на интро-
// экране «Начать подход» и не нонстоп между подходами) — звук НА ВРЕМЯ выполнения
// подхода. Правка ExerciseRunner (узкий unlock). Без bump'а PWA продолжат слышать
// трек уже на ready-интро (iOS-фидбэк Vadim'а).
// v27 (2026-06-02) — кнопка-мут в раннере (Volume2/VolumeX в шапке карточки):
// мгновенно глушит весь звук (трек + cue-бипы) через settings.enabled, размут
// возобновляет. Фидбэк Vadim'а: на смоуке музыка долбила без способа выключить.
// v28 (2026-06-02) — CT1-CT4 редактор «Стандартного тона»: admin крутит частоту/
// длительность/форму волны встроенного тона события (дом-карта, preset_id=null);
// раннер играет кастомный тон. Новый JS-бандл (AdminContent + AudioContext + хук
// превью). Без bump'а PWA держали бы старые chunks.
// v29 (2026-06-02) — кнопка-мут перенесена из шапки карточки В ТАЙМЕР-ЗОНУ
// (timed: absolute правый-верх .sec; rep-only: в баре действий .acts) — у заголовка
// видео её не видно, а взгляд пациента во время подхода на таймере. Фидбэк Vadim'а.
// v30 (2026-06-02) — превью комплекса «глазами пациента» (CreateComplex/EditComplex):
// новый компонент ComplexPreviewModal в инструкторском бандле. Без bump'а PWA
// инструктора держали бы старые chunks (PR #74).
// v31 (2026-06-02) — EditComplex фикс data-loss: добавлены инпут «Отдых (сек)»
// и поле «Внимание» (warnings) + грузятся rest_seconds/warnings/thumbnail_url.
// Новый инструкторский бандл. Без bump'а PWA держали бы старые chunks.
// v32 (2026-06-03) — wizard программы: группировка шаблонов по суставу («Колено»)
// + превью фаз протокола в Step2. Новый инструкторский бандл → bump для chunks.
// v33 (2026-06-03) — wizard: «Текущая фаза» = динамический дропдаун из фаз протокола
// (до 7 фаз вместо хардкода 1-4). Новый инструкторский бандл → bump для chunks.
const CACHE_NAME = 'azarean-v33';
const API_CACHE = 'azarean-api-v33';

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
