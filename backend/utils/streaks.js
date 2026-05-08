const { query, getClient } = require('../database/db');

/**
 * Записывает уникальный день активности и пересчитывает агрегаты streaks.
 * Пропуски НЕ обнуляют стрик: current_streak — это total активных дней.
 * longest_streak — максимальный consecutive run (для retrospective и Star Tracker).
 *
 * Идемпотентна: повторный вызов в тот же день не создаёт дубль (UNIQUE constraint).
 *
 * @param {number} patientId
 * @param {number|null} programId  null — если у пациента нет активной программы
 * @param {string} source  'progress' | 'diary' | 'mini' | 'manual'
 */
async function updateStreak(patientId, programId, source = 'progress') {
  if (!patientId) return;

  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO streak_days (patient_id, program_id, activity_date, source)
       VALUES ($1, $2::int, CURRENT_DATE, $3)
       ON CONFLICT (patient_id, activity_date, program_id) DO NOTHING`,
      [patientId, programId, source]
    );

    // Агрегаты считаем по всей активности пациента в рамках программы
    // (или по всем стрикам если programId не задан).
    const aggregates = await client.query(
      `SELECT COUNT(*)::int AS total_days,
              MAX(activity_date) AS last_activity_date
         FROM streak_days
        WHERE patient_id = $1
          AND ($2::int IS NULL OR program_id = $2 OR program_id IS NULL)`,
      [patientId, programId]
    );

    const totalDays = aggregates.rows[0].total_days || 0;
    const lastDate = aggregates.rows[0].last_activity_date;

    // Longest consecutive run через классический "gaps and islands":
    // дата − rownum постоянна внутри одного непрерывного отрезка.
    const longestRunResult = await client.query(
      `WITH ordered_days AS (
         SELECT activity_date,
                activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date))::int AS grp
           FROM streak_days
          WHERE patient_id = $1
            AND ($2::int IS NULL OR program_id = $2 OR program_id IS NULL)
       )
       SELECT COALESCE(MAX(run_length), 0)::int AS longest_run
         FROM (
           SELECT COUNT(*) AS run_length
             FROM ordered_days
            GROUP BY grp
         ) runs`,
      [patientId, programId]
    );
    const longestRun = longestRunResult.rows[0].longest_run || 0;

    if (programId) {
      await client.query(
        `INSERT INTO streaks (patient_id, program_id, current_streak, longest_streak, total_days, last_activity_date, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (patient_id, program_id) DO UPDATE SET
           current_streak = EXCLUDED.current_streak,
           longest_streak = GREATEST(streaks.longest_streak, EXCLUDED.longest_streak),
           total_days = EXCLUDED.total_days,
           last_activity_date = EXCLUDED.last_activity_date,
           updated_at = NOW()`,
        [patientId, programId, totalDays, longestRun, totalDays, lastDate]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    // Стрик — вспомогательная фича, не должна ломать основной flow
    // (POST /api/progress, POST /my/diary, telegram bot wizard).
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore rollback failure */ }
    }
    console.error('updateStreak error:', err.message, err.code || '');
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

/**
 * Возвращает streak-агрегат для пациента с расширенными полями для UI.
 * Используется в GET /api/rehab/my/streak и в /my/dashboard.
 *
 * @param {number} patientId
 * @returns {Promise<{
 *   current_streak: number,
 *   longest_streak: number,
 *   total_days: number,
 *   last_activity_date: string|null,
 *   days_since_last_activity: number|null,
 *   missed_yesterday: boolean,
 * }>}
 */
async function getStreakSummary(patientId) {
  const result = await query(
    `SELECT s.current_streak,
            s.longest_streak,
            s.total_days,
            s.last_activity_date::text AS last_activity_date,
            CASE
              WHEN s.last_activity_date IS NULL THEN NULL
              ELSE (CURRENT_DATE - s.last_activity_date)::int
            END AS days_since_last_activity
       FROM streaks s
       LEFT JOIN rehab_programs rp ON rp.id = s.program_id
      WHERE s.patient_id = $1
        AND (rp.status = 'active' OR rp.id IS NULL)
      ORDER BY s.current_streak DESC
      LIMIT 1`,
    [patientId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      current_streak: 0,
      longest_streak: 0,
      total_days: 0,
      last_activity_date: null,
      days_since_last_activity: null,
      missed_yesterday: false,
    };
  }

  return {
    current_streak: row.current_streak || 0,
    longest_streak: row.longest_streak || 0,
    total_days: row.total_days || 0,
    last_activity_date: row.last_activity_date || null,
    days_since_last_activity: row.days_since_last_activity,
    missed_yesterday: row.days_since_last_activity === 1,
  };
}

module.exports = { updateStreak, getStreakSummary };
