// =====================================================
// PATIENT ACCESS — единый ownership-предикат для инструкторов
// =====================================================
// Может ли инструктор/админ обращаться к данным конкретного пациента.
//   - admin              → любой пациент
//   - инструктор         → пациент, которого он создал (created_by)
//                          ИЛИ который ему назначен (assigned_instructor_id, Wave 3)
//
// Зеркало предиката из routes/complexes.js:677-682. Вынесено в утилиту, чтобы
// единообразно закрыть IDOR во всех инструкторских эндпоинтах (rehab.js pain/ROM,
// patients.js, progress.js — см. ТЗ Этап 1-2). Без этой проверки инструктор мог
// перебором ?patient_id качать чужую биометрику/историю боли.
// =====================================================

const { query } = require('../database/db');

/**
 * @param {number|string} patientId — id пациента
 * @param {{id:number, role:string}} user — req.user (JWT инструктора/админа)
 * @returns {Promise<boolean>} true если доступ разрешён
 */
async function instructorCanAccessPatient(patientId, user) {
  if (!user || !user.id) return false;
  const pid = Number(patientId);
  if (!Number.isFinite(pid)) return false;

  const { rows } = await query(
    `SELECT 1 FROM patients
       WHERE id = $1
         AND ($3 = 'admin' OR created_by = $2 OR assigned_instructor_id = $2)`,
    [pid, user.id, user.role]
  );
  return rows.length > 0;
}

module.exports = { instructorCanAccessPatient };
