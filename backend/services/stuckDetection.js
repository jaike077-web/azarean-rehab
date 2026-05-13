// =====================================================
// STUCK DETECTION — инструкторская сторона (Wave 1 #1.09)
// =====================================================
// Пациентский баннер (Wave 0 #06) показывает is_stuck при > 1.5×.
// Инструктор видит раньше (yellow 1.3×) и получает push в OPS-бот при red (1.7×).
// Push идёт через utils/opsAlert (per-instructor Telegram-linking отсутствует —
// users.telegram_chat_id колонки нет в схеме, см. drift #7-B 2026-05-13).
//
// Дедуп через UNIQUE(program_id, phase_number, threshold_level) в
// phase_stuck_alerts. Cron понедельник 09:00 МСК прогоняется по всем
// активным программам; повторно тот же alert не вставляется.

const { query } = require('../database/db');
const { parseDurationWeeksUpper } = require('../utils/phaseDuration');
const { sendOpsAlert } = require('../utils/opsAlert');

const YELLOW_MULTIPLIER = 1.3;
const RED_MULTIPLIER = 1.7;

/**
 * Подсчёт stuck-статуса одной программы.
 * @param {Object} program — { id, program_type, current_phase, phase_started_at, created_at }.
 *   Принимает row (НЕ id) — endpoint и cron оба уже сделали SELECT, не дублируем.
 * @returns {Promise<{ yellow, red, actual_weeks, expected_weeks, current_phase, phase_started_at }>}
 *   Если фазы нет в каталоге или open-ended («36+») → yellow=false, red=false.
 */
async function computeStuckStatus(program) {
  if (!program || !program.id) return { yellow: false, red: false };

  // program_type из самой программы — Wave 1 #1.01 убрал хардкод 'acl'
  const phaseResult = await query(
    `SELECT title, duration_weeks
     FROM rehab_phases
     WHERE program_type = $1 AND phase_number = $2 AND is_active = true
     LIMIT 1`,
    [program.program_type, program.current_phase]
  );

  if (phaseResult.rows.length === 0) {
    return { yellow: false, red: false };
  }

  const phase = phaseResult.rows[0];
  const durationWeeksUpper = parseDurationWeeksUpper(phase.duration_weeks);

  // Open-ended («36+») или непарсируемое — никогда не stuck
  if (durationWeeksUpper === null) {
    return {
      yellow: false,
      red: false,
      current_phase: program.current_phase,
      phase_title: phase.title,
      expected_weeks: phase.duration_weeks,
    };
  }

  const phaseStartedAt = program.phase_started_at || program.created_at;
  const phaseStartDate = new Date(phaseStartedAt);
  const daysOnPhase = Math.floor((Date.now() - phaseStartDate) / (1000 * 60 * 60 * 24));
  const actualWeeks = +(daysOnPhase / 7).toFixed(1);

  const yellowThresholdDays = durationWeeksUpper * 7 * YELLOW_MULTIPLIER;
  const redThresholdDays = durationWeeksUpper * 7 * RED_MULTIPLIER;

  return {
    yellow: daysOnPhase > yellowThresholdDays,
    red: daysOnPhase > redThresholdDays,
    current_phase: program.current_phase,
    phase_title: phase.title,
    actual_weeks: actualWeeks,
    expected_weeks: phase.duration_weeks,
    phase_started_at: phaseStartDate.toISOString().split('T')[0],
  };
}

/**
 * Weekly cron task: проверить все активные программы, создать alerts и
 * отправить red-push куратору (через opsAlert, дедуп через UNIQUE).
 *
 * Возвращает { checked, yellow, red, notified } для логирования.
 */
async function checkStuckPhases() {
  const programsResult = await query(
    `SELECT rp.id, rp.patient_id, rp.program_type, rp.current_phase,
            rp.phase_started_at, rp.created_at,
            p.full_name AS patient_name
     FROM rehab_programs rp
     JOIN patients p ON p.id = rp.patient_id
     WHERE rp.is_active = true AND rp.status = 'active' AND p.is_active = true`
  );

  const stats = { checked: 0, yellow: 0, red: 0, notified: 0 };

  for (const program of programsResult.rows) {
    stats.checked += 1;
    const status = await computeStuckStatus(program);

    if (status.yellow) {
      await query(
        `INSERT INTO phase_stuck_alerts (program_id, phase_number, threshold_level)
         VALUES ($1, $2, 'yellow')
         ON CONFLICT (program_id, phase_number, threshold_level) DO NOTHING`,
        [program.id, program.current_phase]
      );
      stats.yellow += 1;
    }

    if (status.red) {
      const inserted = await query(
        `INSERT INTO phase_stuck_alerts (program_id, phase_number, threshold_level)
         VALUES ($1, $2, 'red')
         ON CONFLICT (program_id, phase_number, threshold_level) DO NOTHING
         RETURNING id`,
        [program.id, program.current_phase]
      );
      stats.red += 1;

      // Push отправляем только если alert вставился (т.е. не было ранее)
      // ИЛИ был, но notified_instructor=FALSE (предыдущий push не дошёл).
      const alertStatus = await query(
        `SELECT id, notified_instructor FROM phase_stuck_alerts
         WHERE program_id = $1 AND phase_number = $2 AND threshold_level = 'red'`,
        [program.id, program.current_phase]
      );

      if (alertStatus.rows.length > 0 && !alertStatus.rows[0].notified_instructor) {
        try {
          await sendOpsAlert(
            `🔴 Пациент застрял: ${program.patient_name}`,
            [
              `Программа #${program.id}, фаза ${program.current_phase}`,
              `На фазе: ${status.actual_weeks} нед. (норма ~${status.expected_weeks})`,
              `Превышение красного порога ${RED_MULTIPLIER}×.`,
              ``,
              `Пора пересмотреть программу или поднять фазу вручную.`,
              `https://my.azarean.ru/patients`,
            ].join('\n')
          );
          await query(
            `UPDATE phase_stuck_alerts
             SET notified_instructor = TRUE, notified_at = NOW()
             WHERE id = $1`,
            [alertStatus.rows[0].id]
          );
          stats.notified += 1;
        } catch (err) {
          // opsAlert сам логирует — здесь только не ронять cron
          console.error('[stuckDetection] notify failed:', err.message);
        }
      }
    }
  }

  return stats;
}

module.exports = {
  computeStuckStatus,
  checkStuckPhases,
  YELLOW_MULTIPLIER,
  RED_MULTIPLIER,
};
