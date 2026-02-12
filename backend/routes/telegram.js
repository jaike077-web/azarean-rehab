// =====================================================
// TELEGRAM LINKING API — Sprint 3
// Привязка/отвязка Telegram к аккаунту пациента
// =====================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query } = require('../database/db');
const { authenticatePatient } = require('../middleware/patientAuth');

// =====================================================
// POST /api/telegram/link-code
// Генерирует 6-символьный код привязки (10 минут)
// =====================================================
router.post('/link-code', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    // Отменяем старые неиспользованные коды
    await query(
      `UPDATE telegram_link_codes SET used = true WHERE patient_id = $1 AND used = false`,
      [patientId]
    );

    // Генерируем 6-символьный код
    const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // "A1B2C3"
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    await query(
      `INSERT INTO telegram_link_codes (patient_id, code, expires_at) VALUES ($1, $2, $3)`,
      [patientId, code, expiresAt]
    );

    res.json({
      data: {
        code,
        expires_at: expiresAt.toISOString(),
        bot_username: require('../config/config').telegram.botUsername,
      },
    });
  } catch (error) {
    console.error('Error generating link code:', error);
    res.status(500).json({ error: 'Server Error', message: 'Не удалось сгенерировать код' });
  }
});

// =====================================================
// GET /api/telegram/status
// Проверяет, привязан ли Telegram
// =====================================================
router.get('/status', authenticatePatient, async (req, res) => {
  try {
    const result = await query(
      `SELECT telegram_chat_id FROM patients WHERE id = $1`,
      [req.patient.id]
    );

    const connected = !!result.rows[0]?.telegram_chat_id;

    res.json({ data: { connected } });
  } catch (error) {
    console.error('Error checking telegram status:', error);
    res.status(500).json({ error: 'Server Error', message: 'Не удалось проверить статус' });
  }
});

// =====================================================
// DELETE /api/telegram/unlink
// Отвязывает Telegram от аккаунта
// =====================================================
router.delete('/unlink', authenticatePatient, async (req, res) => {
  try {
    await query(
      `UPDATE patients SET telegram_chat_id = NULL WHERE id = $1`,
      [req.patient.id]
    );

    res.json({ success: true, message: 'Telegram отвязан', data: { connected: false } });
  } catch (error) {
    console.error('Error unlinking telegram:', error);
    res.status(500).json({ error: 'Server Error', message: 'Не удалось отвязать Telegram' });
  }
});

module.exports = router;
