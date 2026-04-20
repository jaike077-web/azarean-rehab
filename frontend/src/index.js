import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/common.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
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
