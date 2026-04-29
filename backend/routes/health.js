// =====================================================
// HEALTH ENDPOINT — minimal probe для cron healthcheck
// =====================================================
// GET /api/health — без auth, минимальная инфа.
// Возвращает 200 если БД отвечает, 503 если нет.
//
// Намеренно НЕ показывает: version, memory, environment, hostname —
// reconnaissance hygiene (атакующий не должен из публичного endpoint
// узнавать какая у вас версия Express чтобы искать CVE).
// =====================================================

const express = require('express');
const { testConnection } = require('../database/db');

const router = express.Router();

const DB_PROBE_TIMEOUT_MS = 2000;

router.get('/', async (req, res) => {
  const start = Date.now();
  try {
    // testConnection() может зависнуть если pg pool exhausted — Promise.race с таймаутом
    const dbAlive = await Promise.race([
      testConnection(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('db probe timeout')), DB_PROBE_TIMEOUT_MS)
      ),
    ]);
    const dbMs = Date.now() - start;

    if (!dbAlive) {
      return res.status(503).json({
        status: 'degraded',
        uptime_sec: Math.floor(process.uptime()),
        db: { alive: false, ms: dbMs },
      });
    }

    return res.json({
      status: 'ok',
      uptime_sec: Math.floor(process.uptime()),
      db: { alive: true, ms: dbMs },
    });
  } catch (err) {
    return res.status(503).json({
      status: 'degraded',
      uptime_sec: Math.floor(process.uptime()),
      db: { alive: false, error: 'check failed' },
    });
  }
});

module.exports = router;
