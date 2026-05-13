// =====================================================
// SCHEDULER SERVICE — Sprint 3
// Cron-задачи для напоминаний через Telegram
// =====================================================

const { query } = require('../database/db');
const { sendTelegramMessage } = require('./telegramBot');
const { checkStuckPhases } = require('./stuckDetection');

let cronJobs = [];

// =====================================================
// ИНИЦИАЛИЗАЦИЯ
// =====================================================
function initScheduler() {
  // Если бот не запущен (нет токена) — не запускаем cron
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('⚠️  Scheduler отключён (TELEGRAM_BOT_TOKEN не задан)');
    return;
  }

  const cron = require('node-cron');

  // Каждую минуту проверяем: есть ли пациенты чьё reminder_time = текущее время
  const exerciseJob = cron.schedule('* * * * *', async () => {
    try {
      await sendExerciseReminders();
    } catch (error) {
      console.error('Scheduler error (exercise):', error.message);
    }
  }, { timezone: 'Europe/Moscow' });

  // В 21:00 МСК — напоминание о дневнике
  const diaryJob = cron.schedule('0 21 * * *', async () => {
    try {
      await sendDiaryReminders();
    } catch (error) {
      console.error('Scheduler error (diary):', error.message);
    }
  }, { timezone: 'Europe/Moscow' });

  // В 12:00 МСК — совет дня
  const tipJob = cron.schedule('0 12 * * *', async () => {
    try {
      await sendDailyTip();
    } catch (error) {
      console.error('Scheduler error (tip):', error.message);
    }
  }, { timezone: 'Europe/Moscow' });

  // Ежедневно в 03:00 МСК — очистка expired tokens
  const cleanupJob = cron.schedule('0 3 * * *', async () => {
    try {
      await cleanupExpiredTokens();
    } catch (error) {
      console.error('Scheduler error (cleanup):', error.message);
    }
  }, { timezone: 'Europe/Moscow' });

  // Ежедневно в 03:30 МСК — hard delete пациентов после grace period (152-ФЗ)
  // Со смещением 30 мин от cleanupJob чтобы не упереться вместе в DB connections.
  const deletionJob = cron.schedule('30 3 * * *', async () => {
    try {
      await processPatientDeletionQueue();
    } catch (error) {
      console.error('Scheduler error (deletion-queue):', error.message);
    }
  }, { timezone: 'Europe/Moscow' });

  // Понедельник 09:00 МСК — stuck-detection (Wave 1 #1.09).
  // Создаёт phase_stuck_alerts для yellow/red превышений, шлёт opsAlert на red.
  // Дедуп через UNIQUE — повторный прогон не дублирует.
  const stuckCheckJob = cron.schedule('0 9 * * 1', async () => {
    try {
      const stats = await checkStuckPhases();
      console.log(`🚦 Stuck-check: проверено ${stats.checked}, yellow ${stats.yellow}, red ${stats.red}, notified ${stats.notified}`);
    } catch (error) {
      console.error('Scheduler error (stuck-check):', error.message);
    }
  }, { timezone: 'Europe/Moscow' });

  cronJobs = [exerciseJob, diaryJob, tipJob, cleanupJob, deletionJob, stuckCheckJob];
  console.log('⏰ Scheduler запущен (6 задач)');
}

// =====================================================
// НАПОМИНАНИЕ ОБ УПРАЖНЕНИЯХ
// Проверяем каждую минуту, у кого reminder_time == сейчас
// =====================================================
async function sendExerciseReminders() {
  // Сравниваем reminder_time с текущим временем в timezone каждого пациента
  const result = await query(
    `SELECT p.telegram_chat_id, p.full_name
     FROM notification_settings ns
     JOIN patients p ON ns.patient_id = p.id
     WHERE ns.exercise_reminders = true
       AND p.telegram_chat_id IS NOT NULL
       AND TO_CHAR(ns.reminder_time, 'HH24:MI') = TO_CHAR(NOW() AT TIME ZONE COALESCE(ns.timezone, 'Europe/Moscow'), 'HH24:MI')`
  );

  for (const row of result.rows) {
    await sendTelegramMessage(
      row.telegram_chat_id,
      `🏋️ Доброе утро, <b>${row.full_name}</b>!\n\nВремя для упражнений. Не забудьте выполнить сегодняшний комплекс!`
    );
  }
}

// =====================================================
// НАПОМИНАНИЕ О ДНЕВНИКЕ
// Только тем, кто ещё не заполнил дневник сегодня
// =====================================================
async function sendDiaryReminders() {
  const today = new Date().toISOString().split('T')[0];

  const result = await query(
    `SELECT p.telegram_chat_id, p.full_name
     FROM notification_settings ns
     JOIN patients p ON ns.patient_id = p.id
     LEFT JOIN diary_entries de ON de.patient_id = p.id AND de.entry_date = $1
     WHERE ns.diary_reminders = true
       AND p.telegram_chat_id IS NOT NULL
       AND de.id IS NULL`,
    [today]
  );

  for (const row of result.rows) {
    await sendTelegramMessage(
      row.telegram_chat_id,
      `📝 <b>${row.full_name}</b>, не забудьте заполнить дневник!\n\nИспользуйте /diary для быстрого заполнения прямо здесь.`
    );
  }
}

// =====================================================
// СОВЕТ ДНЯ
// Пациентам с активной программой и telegram_chat_id
// =====================================================
async function sendDailyTip() {
  const patientsResult = await query(
    `SELECT p.id, p.telegram_chat_id, rp.current_phase
     FROM notification_settings ns
     JOIN patients p ON ns.patient_id = p.id
     LEFT JOIN rehab_programs rp ON rp.patient_id = p.id
       AND rp.status = 'active' AND rp.is_active = true
     WHERE ns.message_notifications = true
       AND p.telegram_chat_id IS NOT NULL`
  );

  for (const patient of patientsResult.rows) {
    try {
      const tipResult = await query(
        `SELECT title, body, icon FROM tips
         WHERE is_active = true
           AND (phase_number = $1 OR phase_number IS NULL)
         ORDER BY RANDOM() LIMIT 1`,
        [patient.current_phase || 1]
      );

      if (tipResult.rows.length > 0) {
        const tip = tipResult.rows[0];
        await sendTelegramMessage(
          patient.telegram_chat_id,
          `${tip.icon || '💡'} <b>${tip.title}</b>\n\n${tip.body}`
        );
      }
    } catch (error) {
      console.error(`Error sending tip to patient ${patient.id}:`, error.message);
    }
  }
}

// =====================================================
// ОЧИСТКА EXPIRED TOKENS
// =====================================================
async function cleanupExpiredTokens() {
  const result1 = await query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
  const result2 = await query('DELETE FROM patient_refresh_tokens WHERE expires_at < NOW()');
  const result3 = await query("DELETE FROM patient_password_resets WHERE expires_at < NOW()");
  const total = (result1.rowCount || 0) + (result2.rowCount || 0) + (result3.rowCount || 0);
  if (total > 0) {
    console.log(`🧹 Очищено ${total} expired tokens`);
  }
}

// =====================================================
// HARD DELETE PATIENTS — обрабатывает patient_deletion_queue
// =====================================================
// Раз в сутки берёт активные запросы (не cancelled, не executed)
// у которых scheduled_for < NOW(), и физически удаляет patient row.
// CASCADE через FK подчищает complexes, progress_logs, diary_entries
// и т.д. Audit log пишется ПЕРЕД удалением (потом patient_id уже не
// будет валидным).
async function processPatientDeletionQueue() {
  const dueResult = await query(
    `SELECT id, patient_id
       FROM patient_deletion_queue
      WHERE scheduled_for < NOW()
        AND executed_at IS NULL
        AND cancelled_at IS NULL`
  );

  if (dueResult.rows.length === 0) {
    return;
  }

  let processed = 0;
  let failed = 0;
  for (const row of dueResult.rows) {
    try {
      // Audit ПЕРЕД delete — потом patient_id невалидный
      await query(
        `INSERT INTO audit_logs
           (user_id, action, entity_type, entity_id, patient_id, ip_address, user_agent, details)
         VALUES (NULL, $1, 'patient', $2, $3, NULL, 'scheduler', $4)`,
        [
          'ACCOUNT_DELETE_EXECUTED',
          row.patient_id,
          row.patient_id,
          JSON.stringify({ queue_id: row.id }),
        ]
      );

      // Hard delete — CASCADE убирает complexes, progress_logs, diary, и т.д.
      // patient_deletion_queue запись тоже cascade'ится (FK ON DELETE CASCADE).
      await query(`DELETE FROM patients WHERE id = $1`, [row.patient_id]);
      processed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[deletion-queue] failed to delete patient ${row.patient_id}: ${err.message}`);
    }
  }

  console.log(`🗑️  Hard delete: обработано ${processed}, ошибок ${failed} (из ${dueResult.rows.length} due)`);
}

// =====================================================
// ОСТАНОВКА
// =====================================================
function stopScheduler() {
  cronJobs.forEach(job => job.stop());
  cronJobs = [];
}

module.exports = {
  initScheduler,
  stopScheduler,
  // Для тестирования
  sendExerciseReminders,
  sendDiaryReminders,
  sendDailyTip,
  cleanupExpiredTokens,
  processPatientDeletionQueue,
  checkStuckPhases,
};
