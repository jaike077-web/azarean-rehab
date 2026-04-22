// =====================================================
// Утилита аудит-логирования (152-ФЗ / GDPR)
// -----------------------------------------------------
// Записывает действия инструкторов/админов над чувствительными
// данными пациентов в audit_logs. Поддерживает actions:
//   'READ', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'.
//
// Fire-and-forget: если запись упала — логируем warning,
// но не ломаем основной запрос. Запрос аудита — second-class.
// =====================================================

const { query } = require('../database/db');

/**
 * Залогировать действие в audit_logs.
 * @param {object} req - Express request (ожидает req.user.id, req.ip, req.headers)
 * @param {string} action - READ | CREATE | UPDATE | DELETE | LOGIN | LOGOUT
 * @param {string} entityType - patient | progress | diary | messages | complex | user ...
 * @param {number|null} entityId - ID сущности
 * @param {object} [options]
 * @param {number|null} [options.patientId] - если затронут пациент, указать для быстрого поиска
 * @param {object} [options.details] - произвольный JSON с контекстом
 */
async function logAudit(req, action, entityType, entityId, options = {}) {
  const userId = req.user?.id || null;
  if (!userId) return; // патиентские запросы не логируем здесь

  const { patientId = null, details = {} } = options;

  try {
    await query(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, patient_id, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        action,
        entityType,
        entityId,
        patientId,
        req.ip || null,
        req.headers?.['user-agent'] || null,
        JSON.stringify(details),
      ]
    );
  } catch (err) {
    console.warn('[audit] failed to write audit log:', err.message);
  }
}

module.exports = { logAudit };
