// =====================================================
// SCHEDULER SERVICE — Sprint 3
// Cron-задачи для напоминаний через Telegram
// =====================================================

const { query } = require('../database/db');
const { sendTelegramMessage } = require('./telegramBot');

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

  cronJobs = [exerciseJob, diaryJob, tipJob];
  console.log('⏰ Scheduler запущен (3 задачи)');
}

// =====================================================
// НАПОМИНАНИЕ ОБ УПРАЖНЕНИЯХ
// Проверяем каждую минуту, у кого reminder_time == сейчас
// =====================================================
async function sendExerciseReminders() {
  // Текущее время в МСК (HH:MM)
  const now = new Date();
  const moscowTime = now.toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const result = await query(
    `SELECT p.telegram_chat_id, p.full_name
     FROM notification_settings ns
     JOIN patients p ON ns.patient_id = p.id
     WHERE ns.exercise_reminders = true
       AND p.telegram_chat_id IS NOT NULL
       AND TO_CHAR(ns.reminder_time, 'HH24:MI') = $1`,
    [moscowTime]
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
};
