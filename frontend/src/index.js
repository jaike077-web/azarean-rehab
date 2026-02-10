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
// PWA: Service Worker Registration (Спринт 0.2)
// =====================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker registered, scope:', reg.scope);

        // Проверяем обновления каждый час
        setInterval(() => reg.update(), 60 * 60 * 1000);

        // Обновление найдено
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
}
