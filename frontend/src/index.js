import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './index.css';
import './styles/common.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// =====================================================
// Sentry observability
// =====================================================
// Если REACT_APP_SENTRY_DSN не задан — SDK не инициализируется,
// init() ниже скипается, никаких событий не отправляется.
// CRA injects REACT_APP_* env vars at build time.
if (process.env.REACT_APP_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // По умолчанию НЕ отправлять IP/cookies/headers с PII.
    sendDefaultPii: false,
  });
  // eslint-disable-next-line no-console
  console.log(`[Sentry] initialized (env: ${process.env.NODE_ENV})`);
}

// =====================================================
// Ops-bot fallback (когда Sentry DSN не задан / не доходит)
// =====================================================
// Sentry.io ingest заблокирован для русских IP. Пока DSN пустой — посылаем
// global window-errors и unhandled promise rejections через свой backend
// в Telegram ops-bot. В dev (без OPS_BOT_TOKEN на бэке) сообщения тихо
// уходят в console.log — никаких сбоев в работе фронта.
function reportToBackend(payload) {
  try {
    const apiUrl = process.env.REACT_APP_API_URL || '';
    fetch(`${apiUrl}/api/log-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(payload),
      keepalive: true, // позволяет уйти запросу даже при unload
    }).catch(() => {});
  } catch {
    // swallow — error reporter не должен сам ронять страницу
  }
}

window.addEventListener('error', (e) => {
  reportToBackend({
    message: (e && e.message) || 'window.error',
    stack: (e && e.error && e.error.stack) || '',
    url: window.location.href,
    userAgent: navigator.userAgent,
    context: {
      source: 'window.error',
      filename: e && e.filename,
      lineno: e && e.lineno,
      colno: e && e.colno,
    },
  });
});

window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  reportToBackend({
    message: (r && r.message) || (r ? String(r) : 'unhandledrejection'),
    stack: (r && r.stack) || '',
    url: window.location.href,
    userAgent: navigator.userAgent,
    context: { source: 'unhandledrejection' },
  });
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 640, margin: '40px auto' }}>
          <h2>Что-то пошло не так</h2>
          <p style={{ color: '#666' }}>
            Ошибка отправлена нам автоматически. Попробуйте обновить страницу.
          </p>
          <button onClick={resetError} style={{ padding: '8px 16px', marginTop: 12 }}>
            Попробовать снова
          </button>
          {process.env.NODE_ENV === 'development' && error && (
            <pre style={{ marginTop: 16, color: '#c00', fontSize: 12 }}>
              {error.toString()}
            </pre>
          )}
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// =====================================================
// PWA: Service Worker Registration
// =====================================================
// В DEV режиме SW отключён — он использует cache-first для .js/.css, что
// в CRA dev (где бандлы без content-hash, отдаются как `bundle.js`) ломает
// hot-reload: F5 отдаёт старую версию из кеша. Если у пользователя уже был
// установлен SW из старых билдов — активно unregister'им + чистим кеши.
if ('serviceWorker' in navigator) {
  if (process.env.NODE_ENV === 'production') {
    // Флаг «новая версия SW активна» + трекер «был ли user вне app».
    // Логика авто-обновления: перезагружаем страницу только когда user
    // вернулся в PWA после отлучки ≥ 60 сек. Так не сбрасываем работу
    // при быстром tab-switch (например, на Telegram проверить нотификацию).
    let newVersionActive = false;
    let hiddenAt = null;
    const AWAY_THRESHOLD_MS = 60 * 1000;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Новый SW взял под контроль клиента (после skipWaiting + clients.claim
      // в sw.js). JS-бандл в памяти всё ещё старый — перезагрузка нужна,
      // но НЕ сейчас (пациент может быть посреди дневника / тренировки).
      newVersionActive = true;
      console.log('[PWA] Новая версия активна, перезагрузка при возврате в приложение');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        const awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = null;
        if (newVersionActive && awayMs >= AWAY_THRESHOLD_MS) {
          console.log('[PWA] Применяем обновление после возврата (' + Math.round(awayMs / 1000) + ' сек вне app)');
          window.location.reload();
        }
      }
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registered, scope:', reg.scope);

          // Проверяем обновления каждый час
          setInterval(() => reg.update(), 60 * 60 * 1000);

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                  console.log('[PWA] New version available');
                }
              });
            }
          });
        })
        .catch((err) => console.log('[PWA] SW registration failed:', err));
    });
  } else {
    // DEV: убираем все ранее установленные SW + их кеши,
    // чтобы у разработчика не залипали старые бандлы.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => {
        r.unregister();
        console.log('[PWA dev] Unregistered stale service worker:', r.scope);
      });
    });
    if (window.caches) {
      caches.keys().then((names) => {
        names.forEach((n) => {
          caches.delete(n);
          console.log('[PWA dev] Cleared cache:', n);
        });
      });
    }
  }
}
