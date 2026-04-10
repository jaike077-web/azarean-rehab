// =====================================================
// CRA DEV PROXY
// =====================================================
// Проксирует /api/* на backend (:5000).
// Ключевое: changeOrigin + удаление origin header, чтобы
// backend получал запрос как "от себя" и не включал CORS middleware.
// Это позволяет cookies SameSite=Strict работать через same-origin.

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      // Убираем origin чтобы backend не включал CORS headers
      // (запрос выглядит как same-origin от :5000)
      onProxyReq: (proxyReq) => {
        proxyReq.removeHeader('origin');
      },
    })
  );
};
