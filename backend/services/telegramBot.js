// =====================================================
// TELEGRAM BOT SERVICE — Sprint 3
// Команды, diary wizard, привязка аккаунта
// =====================================================

const { query } = require('../database/db');

let bot = null;

// In-memory state для diary wizard (chatId → WizardState)
const diaryState = new Map();
const WIZARD_TIMEOUT_MS = 10 * 60 * 1000; // 10 минут

// Маппинг отёка: число → текст
const SWELLING_MAP = { 0: 'none', 1: 'less', 2: 'same', 3: 'more' };
const SWELLING_LABELS = { 0: 'Нет', 1: 'Меньше', 2: 'Так же', 3: 'Больше' };
const MOOD_EMOJIS = { 1: '😢', 2: '😟', 3: '😐', 4: '🙂', 5: '😊' };
const SLEEP_LABELS = { 1: 'Очень плохо', 2: 'Плохо', 3: 'Нормально', 4: 'Хорошо', 5: 'Отлично' };

// =====================================================
// ИНИЦИАЛИЗАЦИЯ БОТА
// =====================================================
function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('⚠️  TELEGRAM_BOT_TOKEN не задан — бот отключён');
    return null;
  }

  const TelegramBot = require('node-telegram-bot-api');
  bot = new TelegramBot(token, { polling: true });

  // Регистрируем меню команд
  bot.setMyCommands([
    { command: 'start', description: 'Начать / привязать аккаунт' },
    { command: 'status', description: 'Мой прогресс и статус' },
    { command: 'diary', description: 'Заполнить дневник' },
    { command: 'tip', description: 'Совет дня' },
    { command: 'help', description: 'Список команд' },
  ]);

  // Обработчики команд
  bot.onText(/\/start(.*)/, handleStart);
  bot.onText(/\/status/, handleStatus);
  bot.onText(/\/diary/, handleDiary);
  bot.onText(/\/tip/, handleTip);
  bot.onText(/\/help/, handleHelp);

  // Inline keyboard callbacks (diary wizard)
  bot.on('callback_query', handleCallbackQuery);

  // Текстовые сообщения (для заметок в wizard)
  bot.on('message', handleTextMessage);

  // Ошибки polling
  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message);
  });

  console.log('🤖 Telegram бот запущен (long polling)');
  return bot;
}

// =====================================================
// /start — привязка аккаунта
// =====================================================
async function handleStart(msg, match) {
  const chatId = msg.chat.id;
  const code = (match[1] || '').trim();

  if (!code) {
    // Без кода — показать инструкцию
    const existing = await getPatientByChatId(chatId);
    if (existing) {
      await sendMessage(chatId,
        `Вы уже подключены, ${existing.full_name}! 👋\n\nИспользуйте /help для списка команд.`
      );
      return;
    }

    await sendMessage(chatId,
      '👋 Добро пожаловать в <b>Azarean Rehab Bot</b>!\n\n' +
      'Для привязки аккаунта:\n' +
      '1. Откройте раздел «Связь» в приложении\n' +
      '2. Нажмите «Подключить @AzareanBot»\n' +
      '3. Скопируйте код и отправьте:\n' +
      '<code>/start ВАШ_КОД</code>'
    );
    return;
  }

  // С кодом — попытка привязки
  try {
    const codeResult = await query(
      `SELECT id, patient_id, expires_at, used
       FROM telegram_link_codes
       WHERE code = $1`,
      [code.toUpperCase()]
    );

    if (codeResult.rows.length === 0) {
      await sendMessage(chatId, '❌ Неверный код. Сгенерируйте новый в приложении.');
      return;
    }

    const linkCode = codeResult.rows[0];

    if (linkCode.used) {
      await sendMessage(chatId, '❌ Этот код уже использован. Сгенерируйте новый в приложении.');
      return;
    }

    if (new Date(linkCode.expires_at) < new Date()) {
      await sendMessage(chatId, '❌ Код истёк. Сгенерируйте новый в приложении.');
      return;
    }

    // Помечаем код как использованный
    await query(
      `UPDATE telegram_link_codes SET used = true WHERE id = $1`,
      [linkCode.id]
    );

    // Привязываем telegram_chat_id к пациенту
    await query(
      `UPDATE patients SET telegram_chat_id = $1 WHERE id = $2`,
      [chatId, linkCode.patient_id]
    );

    // Получаем имя пациента
    const patientResult = await query(
      `SELECT full_name FROM patients WHERE id = $1`,
      [linkCode.patient_id]
    );
    const name = patientResult.rows[0]?.full_name || 'пациент';

    await sendMessage(chatId,
      `✅ Аккаунт привязан!\n\n` +
      `Привет, <b>${name}</b>! 🎉\n\n` +
      `Теперь вы будете получать:\n` +
      `• 🏋️ Напоминания об упражнениях\n` +
      `• 📝 Напоминания о дневнике\n` +
      `• 💡 Совет дня\n\n` +
      `Используйте /help для списка команд.`
    );
  } catch (error) {
    console.error('Error in /start handler:', error);
    await sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.');
  }
}

// =====================================================
// /status — текущий прогресс
// =====================================================
async function handleStatus(msg) {
  const chatId = msg.chat.id;
  const patient = await getPatientByChatId(chatId);

  if (!patient) {
    await sendMessage(chatId, '❌ Аккаунт не привязан. Используйте /start для привязки.');
    return;
  }

  try {
    // Получаем программу
    const programResult = await query(
      `SELECT rp.title, rp.current_phase, rp.surgery_date,
              ph.title as phase_title, ph.subtitle as phase_subtitle
       FROM rehab_programs rp
       LEFT JOIN rehab_phases ph ON ph.phase_number = rp.current_phase AND ph.program_type = 'acl'
       WHERE rp.patient_id = $1 AND rp.status = 'active' AND rp.is_active = true
       LIMIT 1`,
      [patient.id]
    );

    // Получаем стрик
    const streakResult = await query(
      `SELECT current_streak, longest_streak, total_days FROM streaks WHERE patient_id = $1 LIMIT 1`,
      [patient.id]
    );

    // Проверяем дневник сегодня
    const today = new Date().toISOString().split('T')[0];
    const diaryResult = await query(
      `SELECT id FROM diary_entries WHERE patient_id = $1 AND entry_date = $2`,
      [patient.id, today]
    );

    let text = `📊 <b>Статус — ${patient.full_name}</b>\n\n`;

    if (programResult.rows.length > 0) {
      const prog = programResult.rows[0];
      text += `🏥 Программа: ${prog.title}\n`;
      text += `📍 Фаза ${prog.current_phase}: ${prog.phase_title || '—'}\n`;
      if (prog.phase_subtitle) text += `   ${prog.phase_subtitle}\n`;
      text += '\n';
    } else {
      text += '📋 Активная программа не найдена\n\n';
    }

    if (streakResult.rows.length > 0) {
      const streak = streakResult.rows[0];
      text += `🔥 Стрик: ${streak.current_streak} дн.\n`;
      text += `🏆 Лучший: ${streak.longest_streak} дн.\n`;
      text += `📅 Всего: ${streak.total_days} дн.\n\n`;
    }

    const diaryFilled = diaryResult.rows.length > 0;
    text += diaryFilled
      ? '✅ Дневник сегодня заполнен'
      : '📝 Дневник сегодня НЕ заполнен — /diary';

    await sendMessage(chatId, text);
  } catch (error) {
    console.error('Error in /status handler:', error);
    await sendMessage(chatId, '⚠️ Не удалось получить статус. Попробуйте позже.');
  }
}

// =====================================================
// /diary — запуск wizard
// =====================================================
async function handleDiary(msg) {
  const chatId = msg.chat.id;
  const patient = await getPatientByChatId(chatId);

  if (!patient) {
    await sendMessage(chatId, '❌ Аккаунт не привязан. Используйте /start для привязки.');
    return;
  }

  // Сбрасываем предыдущее состояние
  diaryState.set(chatId, {
    step: 'pain',
    data: {},
    patientId: patient.id,
    startedAt: Date.now(),
  });

  // Автоочистка через 10 мин
  setTimeout(() => {
    if (diaryState.has(chatId) && diaryState.get(chatId).step !== 'done') {
      diaryState.delete(chatId);
    }
  }, WIZARD_TIMEOUT_MS);

  await sendMessage(chatId,
    '📝 <b>Заполнение дневника</b>\n\n' +
    'Шаг 1/6: Оцените уровень боли (0 — нет, 10 — максимальная)',
    {
      reply_markup: {
        inline_keyboard: [
          [0, 1, 2, 3, 4, 5].map(n => ({ text: String(n), callback_data: `diary_pain_${n}` })),
          [6, 7, 8, 9, 10].map(n => ({ text: String(n), callback_data: `diary_pain_${n}` })),
        ],
      },
    }
  );
}

// =====================================================
// /tip — совет дня
// =====================================================
async function handleTip(msg) {
  const chatId = msg.chat.id;
  const patient = await getPatientByChatId(chatId);

  if (!patient) {
    await sendMessage(chatId, '❌ Аккаунт не привязан. Используйте /start для привязки.');
    return;
  }

  try {
    // Получаем текущую фазу пациента
    const progResult = await query(
      `SELECT current_phase FROM rehab_programs
       WHERE patient_id = $1 AND status = 'active' AND is_active = true LIMIT 1`,
      [patient.id]
    );
    const phase = progResult.rows[0]?.current_phase || 1;

    const tipResult = await query(
      `SELECT title, body, icon FROM tips
       WHERE is_active = true
         AND (phase_number = $1 OR phase_number IS NULL)
       ORDER BY RANDOM() LIMIT 1`,
      [phase]
    );

    if (tipResult.rows.length === 0) {
      await sendMessage(chatId, '💡 Советы пока не добавлены для вашей фазы.');
      return;
    }

    const tip = tipResult.rows[0];
    await sendMessage(chatId, `${tip.icon || '💡'} <b>${tip.title}</b>\n\n${tip.body}`);
  } catch (error) {
    console.error('Error in /tip handler:', error);
    await sendMessage(chatId, '⚠️ Не удалось получить совет. Попробуйте позже.');
  }
}

// =====================================================
// /help — список команд
// =====================================================
async function handleHelp(msg) {
  const chatId = msg.chat.id;
  await sendMessage(chatId,
    '📋 <b>Команды бота</b>\n\n' +
    '/status — Мой прогресс и статус\n' +
    '/diary — Заполнить дневник\n' +
    '/tip — Совет дня\n' +
    '/help — Список команд\n\n' +
    '🔔 Бот отправляет напоминания автоматически по расписанию.'
  );
}

// =====================================================
// CALLBACK QUERY — diary wizard
// =====================================================
async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  // Подтверждаем нажатие кнопки
  try { await bot.answerCallbackQuery(callbackQuery.id); } catch (e) { /* ignore */ }

  if (!data.startsWith('diary_')) return;

  const state = diaryState.get(chatId);
  if (!state) {
    await sendMessage(chatId, '⏰ Сессия истекла. Начните заново: /diary');
    return;
  }

  // Парсим callback
  const parts = data.split('_'); // diary_pain_5, diary_swell_2, etc.
  const action = parts[1];
  const value = parts[2];

  switch (action) {
    case 'pain':
      state.data.pain_level = parseInt(value);
      state.step = 'swelling';
      await sendMessage(chatId,
        '📝 Шаг 2/6: Отёк колена',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Нет', callback_data: 'diary_swell_0' },
                { text: 'Меньше', callback_data: 'diary_swell_1' },
                { text: 'Так же', callback_data: 'diary_swell_2' },
                { text: 'Больше', callback_data: 'diary_swell_3' },
              ],
            ],
          },
        }
      );
      break;

    case 'swell':
      state.data.swelling = SWELLING_MAP[parseInt(value)];
      state.step = 'mobility';
      await sendMessage(chatId,
        '📝 Шаг 3/6: Подвижность (0 — не двигается, 10 — полная)',
        {
          reply_markup: {
            inline_keyboard: [
              [0, 1, 2, 3, 4, 5].map(n => ({ text: String(n), callback_data: `diary_mob_${n}` })),
              [6, 7, 8, 9, 10].map(n => ({ text: String(n), callback_data: `diary_mob_${n}` })),
            ],
          },
        }
      );
      break;

    case 'mob':
      state.data.mobility = parseInt(value);
      state.step = 'mood';
      await sendMessage(chatId,
        '📝 Шаг 4/6: Настроение',
        {
          reply_markup: {
            inline_keyboard: [
              [1, 2, 3, 4, 5].map(n => ({
                text: MOOD_EMOJIS[n],
                callback_data: `diary_mood_${n}`,
              })),
            ],
          },
        }
      );
      break;

    case 'mood':
      state.data.mood = parseInt(value);
      state.step = 'sleep';
      await sendMessage(chatId,
        '📝 Шаг 5/6: Качество сна',
        {
          reply_markup: {
            inline_keyboard: [
              [1, 2, 3, 4, 5].map(n => ({
                text: `${n} ${SLEEP_LABELS[n]}`,
                callback_data: `diary_sleep_${n}`,
              })),
            ],
          },
        }
      );
      break;

    case 'sleep':
      state.data.sleep_quality = parseInt(value);
      state.step = 'notes';
      await sendMessage(chatId,
        '📝 Шаг 6/6: Заметки\n\nНапишите текстом или нажмите «Пропустить»',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⏭️ Пропустить', callback_data: 'diary_notes_skip' }],
            ],
          },
        }
      );
      break;

    case 'notes':
      state.data.notes = '';
      state.step = 'confirm';
      await showDiarySummary(chatId, state.data);
      break;

    case 'save':
      await saveDiary(chatId, state);
      break;

    case 'cancel':
      diaryState.delete(chatId);
      await sendMessage(chatId, '❌ Заполнение дневника отменено.');
      break;

    default:
      break;
  }
}

// =====================================================
// ТЕКСТОВЫЕ СООБЩЕНИЯ — заметки в wizard
// =====================================================
async function handleTextMessage(msg) {
  const chatId = msg.chat.id;

  // Игнорируем команды
  if (msg.text && msg.text.startsWith('/')) return;

  const state = diaryState.get(chatId);
  if (!state || state.step !== 'notes') return;

  state.data.notes = msg.text || '';
  state.step = 'confirm';
  await showDiarySummary(chatId, state.data);
}

// =====================================================
// ПОКАЗАТЬ SUMMARY ДНЕВНИКА
// =====================================================
async function showDiarySummary(chatId, data) {
  const swellLabel = SWELLING_LABELS[
    Object.keys(SWELLING_MAP).find(k => SWELLING_MAP[k] === data.swelling) || 0
  ] || data.swelling;

  let text = '📋 <b>Итоги дневника</b>\n\n';
  text += `😣 Боль: <b>${data.pain_level}/10</b>\n`;
  text += `🦵 Отёк: <b>${swellLabel}</b>\n`;
  text += `🤸 Подвижность: <b>${data.mobility}/10</b>\n`;
  text += `${MOOD_EMOJIS[data.mood] || '😐'} Настроение: <b>${data.mood}/5</b>\n`;
  text += `😴 Сон: <b>${data.sleep_quality}/5</b>\n`;
  if (data.notes) text += `📝 Заметка: ${data.notes}\n`;
  text += '\nСохранить запись?';

  await sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Сохранить', callback_data: 'diary_save_yes' },
          { text: '❌ Отмена', callback_data: 'diary_cancel_no' },
        ],
      ],
    },
  });
}

// =====================================================
// СОХРАНИТЬ ДНЕВНИК В БД
// =====================================================
async function saveDiary(chatId, state) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { pain_level, swelling, mobility, mood, sleep_quality, notes } = state.data;

    // Получаем program_id
    const progResult = await query(
      `SELECT id FROM rehab_programs
       WHERE patient_id = $1 AND status = 'active' AND is_active = true LIMIT 1`,
      [state.patientId]
    );
    const programId = progResult.rows[0]?.id || null;

    // UPSERT дневника
    await query(
      `INSERT INTO diary_entries (patient_id, program_id, entry_date, pain_level, swelling, mobility, mood, sleep_quality, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (patient_id, entry_date) DO UPDATE SET
         pain_level = EXCLUDED.pain_level,
         swelling = EXCLUDED.swelling,
         mobility = EXCLUDED.mobility,
         mood = EXCLUDED.mood,
         sleep_quality = EXCLUDED.sleep_quality,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [state.patientId, programId, today, pain_level, swelling, mobility, mood, sleep_quality, notes || '']
    );

    // Обновляем стрик
    await updateStreak(state.patientId, programId);

    diaryState.set(chatId, { ...state, step: 'done' });

    await sendMessage(chatId,
      '✅ <b>Дневник сохранён!</b>\n\n' +
      'Отличная работа! Продолжайте вести записи каждый день.\n' +
      'Используйте /status для просмотра вашего прогресса.'
    );
  } catch (error) {
    console.error('Error saving diary via bot:', error);
    await sendMessage(chatId, '⚠️ Не удалось сохранить дневник. Попробуйте позже.');
  } finally {
    diaryState.delete(chatId);
  }
}

// =====================================================
// ОБНОВИТЬ СТРИК (копия логики из rehab.js)
// =====================================================
async function updateStreak(patientId, programId) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const streakResult = await query(
      `SELECT id, current_streak, longest_streak, total_days, last_activity_date
       FROM streaks WHERE patient_id = $1 AND program_id = $2`,
      [patientId, programId]
    );

    if (streakResult.rows.length === 0) {
      await query(
        `INSERT INTO streaks (patient_id, program_id, current_streak, longest_streak, total_days, last_activity_date)
         VALUES ($1, $2, 1, 1, 1, $3)
         ON CONFLICT (patient_id, program_id) DO UPDATE SET
           current_streak = 1, longest_streak = GREATEST(streaks.longest_streak, 1),
           total_days = streaks.total_days + 1, last_activity_date = $3`,
        [patientId, programId, today]
      );
      return;
    }

    const streak = streakResult.rows[0];
    const lastDate = streak.last_activity_date
      ? new Date(streak.last_activity_date).toISOString().split('T')[0]
      : null;

    if (lastDate === today) return; // Уже обновлено сегодня

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const isConsecutive = lastDate === yesterdayStr;
    const newStreak = isConsecutive ? streak.current_streak + 1 : 1;
    const newLongest = Math.max(streak.longest_streak, newStreak);

    await query(
      `UPDATE streaks SET current_streak = $1, longest_streak = $2,
       total_days = total_days + 1, last_activity_date = $3
       WHERE id = $4`,
      [newStreak, newLongest, today, streak.id]
    );
  } catch (error) {
    console.error('Error updating streak from bot:', error);
  }
}

// =====================================================
// УТИЛИТЫ
// =====================================================
async function getPatientByChatId(chatId) {
  try {
    const result = await query(
      `SELECT id, full_name, email FROM patients WHERE telegram_chat_id = $1`,
      [chatId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting patient by chat id:', error);
    return null;
  }
}

async function sendMessage(chatId, text, options = {}) {
  if (!bot) return;
  try {
    return await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
  } catch (error) {
    console.error('Telegram send error:', error.message);
  }
}

/**
 * Отправка сообщения по chatId (для scheduler и внешних модулей)
 */
async function sendTelegramMessage(chatId, text, options = {}) {
  return sendMessage(chatId, text, options);
}

function getBot() {
  return bot;
}

module.exports = { initBot, sendTelegramMessage, getBot };
