// =====================================================
// ROUTES: Реабилитационные программы (Спринт 1.1)
//
// Два типа доступа:
// 1. Пациент (authenticatePatient) — JWT пациента
// 2. Инструктор (authenticateToken) — JWT инструктора
//
// Публичный доступ — справочники фаз и советы
// =====================================================

const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { authenticatePatient } = require('../middleware/patientAuth');
const { authenticateToken } = require('../middleware/auth');

// =====================================================
// ПУБЛИЧНЫЕ: Справочник фаз реабилитации
// =====================================================

/**
 * GET /api/rehab/phases?type=acl
 * Получить все фазы для типа программы
 */
router.get('/phases', async (req, res) => {
  try {
    const { type = 'acl' } = req.query;

    const result = await query(
      `SELECT id, program_type, phase_number, title, subtitle,
              duration_weeks, description, goals, restrictions,
              criteria_next, icon, color
       FROM rehab_phases
       WHERE program_type = $1 AND is_active = true
       ORDER BY phase_number`,
      [type]
    );

    // Парсим JSON-поля
    const phases = result.rows.map((phase) => ({
      ...phase,
      goals: safeJsonParse(phase.goals),
      restrictions: safeJsonParse(phase.restrictions),
      criteria_next: safeJsonParse(phase.criteria_next),
    }));

    res.json({ data: phases });
  } catch (error) {
    console.error('Ошибка получения фаз:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения фаз реабилитации' });
  }
});

/**
 * GET /api/rehab/phases/:id
 * Получить конкретную фазу с видео
 */
router.get('/phases/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const phaseResult = await query(
      `SELECT * FROM rehab_phases WHERE id = $1 AND is_active = true`,
      [id]
    );

    if (phaseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Фаза не найдена' });
    }

    const phase = phaseResult.rows[0];

    // Видео для этой фазы
    const videosResult = await query(
      `SELECT id, title, description, video_url, thumbnail_url, duration_seconds, order_number
       FROM phase_videos
       WHERE phase_id = $1 AND is_active = true
       ORDER BY order_number`,
      [id]
    );

    res.json({
      data: {
        ...phase,
        goals: safeJsonParse(phase.goals),
        restrictions: safeJsonParse(phase.restrictions),
        criteria_next: safeJsonParse(phase.criteria_next),
        videos: videosResult.rows,
      }
    });
  } catch (error) {
    console.error('Ошибка получения фазы:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения фазы' });
  }
});

/**
 * GET /api/rehab/tips?type=acl&phase=1&category=motivation
 * Получить советы (с фильтрацией)
 */
router.get('/tips', async (req, res) => {
  try {
    const { type, phase, category, limit = 5 } = req.query;

    let sql = `SELECT id, program_type, phase_number, category, title, body, icon
               FROM tips WHERE is_active = true`;
    const params = [];

    if (type) {
      params.push(type);
      sql += ` AND (program_type = $${params.length} OR program_type = 'general')`;
    }

    if (phase) {
      params.push(parseInt(phase));
      sql += ` AND (phase_number = $${params.length} OR phase_number IS NULL)`;
    }

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    // Случайный порядок для разнообразия
    sql += ` ORDER BY RANDOM()`;

    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;

    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Ошибка получения советов:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения советов' });
  }
});

// =====================================================
// ПАЦИЕНТ: Программы реабилитации
// =====================================================

/**
 * GET /api/rehab/my/program
 * Получить активную программу пациента
 */
router.get('/my/program', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    const result = await query(
      `SELECT rp.*,
              p.full_name as patient_name,
              u.full_name as instructor_name
       FROM rehab_programs rp
       LEFT JOIN patients p ON rp.patient_id = p.id
       LEFT JOIN users u ON rp.created_by = u.id
       WHERE rp.patient_id = $1 AND rp.is_active = true AND rp.status = 'active'
       ORDER BY rp.created_at DESC
       LIMIT 1`,
      [patientId]
    );

    if (result.rows.length === 0) {
      return res.json({ data: null, message: 'Нет активной программы' });
    }

    const program = result.rows[0];

    // Получаем инфо о текущей фазе
    const phaseResult = await query(
      `SELECT * FROM rehab_phases
       WHERE program_type = 'acl' AND phase_number = $1 AND is_active = true`,
      [program.current_phase]
    );

    const phase = phaseResult.rows[0] || null;

    res.json({
      data: {
        ...program,
        phase: phase ? {
          ...phase,
          goals: safeJsonParse(phase.goals),
          restrictions: safeJsonParse(phase.restrictions),
          criteria_next: safeJsonParse(phase.criteria_next),
        } : null,
      }
    });
  } catch (error) {
    console.error('Ошибка получения программы:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения программы' });
  }
});

/**
 * GET /api/rehab/my/dashboard
 * Главный экран пациента: программа + стрик + совет + последняя запись дневника
 */
router.get('/my/dashboard', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    // 1. Активная программа
    const programResult = await query(
      `SELECT rp.id, rp.title, rp.diagnosis, rp.current_phase, rp.phase_started_at,
              rp.surgery_date, rp.status
       FROM rehab_programs rp
       WHERE rp.patient_id = $1 AND rp.is_active = true AND rp.status = 'active'
       ORDER BY rp.created_at DESC LIMIT 1`,
      [patientId]
    );

    const program = programResult.rows[0] || null;

    // 2. Текущая фаза (если есть программа)
    let phase = null;
    if (program) {
      const phaseResult = await query(
        `SELECT id, phase_number, title, subtitle, duration_weeks, icon, color
         FROM rehab_phases
         WHERE program_type = 'acl' AND phase_number = $1 AND is_active = true`,
        [program.current_phase]
      );
      phase = phaseResult.rows[0] || null;
    }

    // 3. Стрик
    const streakResult = await query(
      `SELECT current_streak, longest_streak, total_days, last_activity_date
       FROM streaks
       WHERE patient_id = $1
       ORDER BY current_streak DESC LIMIT 1`,
      [patientId]
    );
    const streak = streakResult.rows[0] || { current_streak: 0, longest_streak: 0, total_days: 0 };

    // 4. Последняя запись дневника
    const diaryResult = await query(
      `SELECT id, entry_date, pain_level, mood, exercises_done, notes
       FROM diary_entries
       WHERE patient_id = $1
       ORDER BY entry_date DESC LIMIT 1`,
      [patientId]
    );
    const lastDiary = diaryResult.rows[0] || null;

    // 5. Совет дня (случайный, подходящий по фазе)
    let tipSql = `SELECT id, title, body, icon, category
                  FROM tips WHERE is_active = true`;
    const tipParams = [];

    if (program) {
      tipParams.push(program.current_phase);
      tipSql += ` AND (phase_number = $${tipParams.length} OR phase_number IS NULL)`;
      tipSql += ` AND (program_type = 'acl' OR program_type = 'general')`;
    } else {
      tipSql += ` AND program_type = 'general'`;
    }
    tipSql += ` ORDER BY RANDOM() LIMIT 1`;

    const tipResult = await query(tipSql, tipParams);
    const tip = tipResult.rows[0] || null;

    // 6. Есть ли запись дневника сегодня?
    const today = new Date().toISOString().split('T')[0];
    const todayDiaryResult = await query(
      `SELECT id FROM diary_entries WHERE patient_id = $1 AND entry_date = $2`,
      [patientId, today]
    );
    const diaryFilledToday = todayDiaryResult.rows.length > 0;

    res.json({
      data: {
        program,
        phase,
        streak,
        lastDiary,
        tip,
        diaryFilledToday,
      }
    });
  } catch (error) {
    console.error('Ошибка получения дашборда:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения дашборда' });
  }
});

// =====================================================
// ПАЦИЕНТ: Дневник
// =====================================================

/**
 * GET /api/rehab/my/diary?from=2026-01-01&to=2026-02-10
 * Получить записи дневника за период
 */
router.get('/my/diary', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { from, to, limit = 30 } = req.query;

    let sql = `SELECT * FROM diary_entries WHERE patient_id = $1`;
    const params = [patientId];

    if (from) {
      params.push(from);
      sql += ` AND entry_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND entry_date <= $${params.length}`;
    }

    sql += ` ORDER BY entry_date DESC`;
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;

    const result = await query(sql, params);
    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Ошибка получения дневника:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения дневника' });
  }
});

/**
 * POST /api/rehab/my/diary
 * Создать/обновить запись дневника за день (UPSERT)
 */
router.post('/my/diary', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const {
      entry_date,
      pain_level,
      swelling,
      mobility,
      mood,
      exercises_done,
      sleep_quality,
      notes
    } = req.body;

    const date = entry_date || new Date().toISOString().split('T')[0];

    // Валидация
    if (pain_level !== undefined && (pain_level < 0 || pain_level > 10)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Уровень боли должен быть от 0 до 10' });
    }
    if (mood !== undefined && (mood < 1 || mood > 5)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Настроение должно быть от 1 до 5' });
    }

    // Находим активную программу
    const programResult = await query(
      `SELECT id FROM rehab_programs
       WHERE patient_id = $1 AND is_active = true AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [patientId]
    );
    const programId = programResult.rows[0]?.id || null;

    // UPSERT: одна запись в день
    const result = await query(
      `INSERT INTO diary_entries
       (patient_id, program_id, entry_date, pain_level, swelling, mobility, mood, exercises_done, sleep_quality, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (patient_id, entry_date)
       DO UPDATE SET
         pain_level = COALESCE(EXCLUDED.pain_level, diary_entries.pain_level),
         swelling = COALESCE(EXCLUDED.swelling, diary_entries.swelling),
         mobility = COALESCE(EXCLUDED.mobility, diary_entries.mobility),
         mood = COALESCE(EXCLUDED.mood, diary_entries.mood),
         exercises_done = COALESCE(EXCLUDED.exercises_done, diary_entries.exercises_done),
         sleep_quality = COALESCE(EXCLUDED.sleep_quality, diary_entries.sleep_quality),
         notes = COALESCE(EXCLUDED.notes, diary_entries.notes),
         updated_at = NOW()
       RETURNING *`,
      [patientId, programId, date, pain_level, swelling, mobility, mood, exercises_done, sleep_quality, notes]
    );

    // Обновляем стрик если упражнения выполнены
    if (exercises_done) {
      await updateStreak(patientId, programId, date);
    }

    res.status(201).json({ message: 'Запись сохранена', data: result.rows[0] });
  } catch (error) {
    console.error('Ошибка сохранения дневника:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка сохранения записи дневника' });
  }
});

/**
 * GET /api/rehab/my/diary/:date
 * Получить запись дневника за конкретную дату
 */
router.get('/my/diary/:date', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { date } = req.params;

    const result = await query(
      `SELECT * FROM diary_entries WHERE patient_id = $1 AND entry_date = $2`,
      [patientId, date]
    );

    if (result.rows.length === 0) {
      return res.json({ data: null });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Ошибка получения записи дневника:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения записи' });
  }
});

// =====================================================
// ПАЦИЕНТ: Стрики
// =====================================================

/**
 * GET /api/rehab/my/streak
 * Получить текущий стрик пациента
 */
router.get('/my/streak', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    const result = await query(
      `SELECT s.*, rp.title as program_title
       FROM streaks s
       LEFT JOIN rehab_programs rp ON s.program_id = rp.id
       WHERE s.patient_id = $1
       ORDER BY s.current_streak DESC`,
      [patientId]
    );

    // Агрегированный стрик
    const totalDays = result.rows.reduce((sum, s) => sum + (s.total_days || 0), 0);
    const bestStreak = Math.max(0, ...result.rows.map((s) => s.longest_streak || 0));
    const currentStreak = result.rows[0]?.current_streak || 0;

    res.json({
      data: {
        current_streak: currentStreak,
        longest_streak: bestStreak,
        total_days: totalDays,
        last_activity_date: result.rows[0]?.last_activity_date || null,
        programs: result.rows,
      }
    });
  } catch (error) {
    console.error('Ошибка получения стрика:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения стрика' });
  }
});

// =====================================================
// ПАЦИЕНТ: Сообщения
// =====================================================

/**
 * GET /api/rehab/my/messages?program_id=1
 * Получить сообщения по программе
 */
router.get('/my/messages', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { program_id, limit = 50, offset = 0 } = req.query;

    // Проверяем что программа принадлежит пациенту
    if (program_id) {
      const checkResult = await query(
        `SELECT id FROM rehab_programs WHERE id = $1 AND patient_id = $2`,
        [program_id, patientId]
      );
      if (checkResult.rows.length === 0) {
        return res.status(403).json({ error: 'Forbidden', message: 'Нет доступа к этой программе' });
      }
    }

    let sql = `SELECT m.*,
                CASE
                  WHEN m.sender_type = 'patient' THEN p.full_name
                  WHEN m.sender_type = 'instructor' THEN u.full_name
                END as sender_name
               FROM messages m
               LEFT JOIN patients p ON m.sender_type = 'patient' AND m.sender_id = p.id
               LEFT JOIN users u ON m.sender_type = 'instructor' AND m.sender_id = u.id
               WHERE m.program_id IN (
                 SELECT id FROM rehab_programs WHERE patient_id = $1
               )`;
    const params = [patientId];

    if (program_id) {
      params.push(parseInt(program_id));
      sql += ` AND m.program_id = $${params.length}`;
    }

    sql += ` ORDER BY m.created_at DESC`;
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const result = await query(sql, params);

    // Отмечаем входящие как прочитанные
    if (program_id) {
      await query(
        `UPDATE messages SET is_read = true
         WHERE program_id = $1 AND sender_type = 'instructor' AND is_read = false`,
        [program_id]
      );
    }

    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Ошибка получения сообщений:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения сообщений' });
  }
});

/**
 * POST /api/rehab/my/messages
 * Отправить сообщение инструктору
 */
router.post('/my/messages', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { program_id, body } = req.body;

    if (!program_id || !body || !body.trim()) {
      return res.status(400).json({ error: 'Validation Error', message: 'Программа и текст сообщения обязательны' });
    }

    // Проверяем доступ
    const checkResult = await query(
      `SELECT id FROM rehab_programs WHERE id = $1 AND patient_id = $2`,
      [program_id, patientId]
    );
    if (checkResult.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden', message: 'Нет доступа к этой программе' });
    }

    const result = await query(
      `INSERT INTO messages (program_id, sender_type, sender_id, body)
       VALUES ($1, 'patient', $2, $3)
       RETURNING *`,
      [program_id, patientId, body.trim()]
    );

    res.status(201).json({ message: 'Сообщение отправлено', data: result.rows[0] });
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка отправки сообщения' });
  }
});

/**
 * GET /api/rehab/my/messages/unread
 * Количество непрочитанных сообщений
 */
router.get('/my/messages/unread', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    const result = await query(
      `SELECT COUNT(*) as count
       FROM messages m
       JOIN rehab_programs rp ON m.program_id = rp.id
       WHERE rp.patient_id = $1 AND m.sender_type = 'instructor' AND m.is_read = false`,
      [patientId]
    );

    res.json({ data: { unread: parseInt(result.rows[0].count) || 0 } });
  } catch (error) {
    console.error('Ошибка подсчёта непрочитанных:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка подсчёта сообщений' });
  }
});

// =====================================================
// ПАЦИЕНТ: Настройки уведомлений
// =====================================================

/**
 * GET /api/rehab/my/notifications
 * Получить настройки уведомлений
 */
router.get('/my/notifications', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    const result = await query(
      `SELECT * FROM notification_settings WHERE patient_id = $1`,
      [patientId]
    );

    if (result.rows.length === 0) {
      // Возвращаем дефолтные настройки
      return res.json({
        data: {
          exercise_reminders: true,
          diary_reminders: true,
          message_notifications: true,
          reminder_time: '09:00',
          timezone: 'Europe/Moscow',
        }
      });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Ошибка получения настроек:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения настроек' });
  }
});

/**
 * PUT /api/rehab/my/notifications
 * Обновить настройки уведомлений (UPSERT)
 */
router.put('/my/notifications', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const {
      exercise_reminders,
      diary_reminders,
      message_notifications,
      reminder_time,
      timezone
    } = req.body;

    const result = await query(
      `INSERT INTO notification_settings
       (patient_id, exercise_reminders, diary_reminders, message_notifications, reminder_time, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (patient_id)
       DO UPDATE SET
         exercise_reminders = COALESCE($2, notification_settings.exercise_reminders),
         diary_reminders = COALESCE($3, notification_settings.diary_reminders),
         message_notifications = COALESCE($4, notification_settings.message_notifications),
         reminder_time = COALESCE($5, notification_settings.reminder_time),
         timezone = COALESCE($6, notification_settings.timezone),
         updated_at = NOW()
       RETURNING *`,
      [
        patientId,
        exercise_reminders ?? true,
        diary_reminders ?? true,
        message_notifications ?? true,
        reminder_time || '09:00',
        timezone || 'Europe/Moscow'
      ]
    );

    res.json({ message: 'Настройки сохранены', data: result.rows[0] });
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка сохранения настроек' });
  }
});

// =====================================================
// ИНСТРУКТОР: Управление программами
// =====================================================

/**
 * GET /api/rehab/programs?patient_id=1
 * Получить программы (для инструктора)
 */
router.get('/programs', authenticateToken, async (req, res) => {
  try {
    const { patient_id, status } = req.query;

    let sql = `SELECT rp.*,
                      p.full_name as patient_name,
                      p.email as patient_email,
                      ph.title as phase_title,
                      ph.subtitle as phase_subtitle,
                      ph.color as phase_color
               FROM rehab_programs rp
               LEFT JOIN patients p ON rp.patient_id = p.id
               LEFT JOIN rehab_phases ph ON ph.program_type = 'acl'
                 AND ph.phase_number = rp.current_phase
               WHERE rp.is_active = true`;
    const params = [];

    if (patient_id) {
      params.push(parseInt(patient_id));
      sql += ` AND rp.patient_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND rp.status = $${params.length}`;
    }

    // Инструктор видит только своих пациентов
    params.push(req.user.id);
    sql += ` AND rp.created_by = $${params.length}`;

    sql += ` ORDER BY rp.created_at DESC`;

    const result = await query(sql, params);
    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Ошибка получения программ:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения программ' });
  }
});

/**
 * POST /api/rehab/programs
 * Создать программу для пациента
 */
router.post('/programs', authenticateToken, async (req, res) => {
  try {
    const {
      patient_id,
      complex_id,
      title,
      diagnosis,
      surgery_date,
      current_phase,
      notes
    } = req.body;

    if (!patient_id || !title) {
      return res.status(400).json({ error: 'Validation Error', message: 'ID пациента и название обязательны' });
    }

    // Проверяем что пациент принадлежит инструктору
    const patientCheck = await query(
      `SELECT id FROM patients WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)`,
      [patient_id, req.user.id]
    );
    if (patientCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden', message: 'Нет доступа к этому пациенту' });
    }

    const result = await query(
      `INSERT INTO rehab_programs
       (patient_id, complex_id, title, diagnosis, surgery_date, current_phase, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        patient_id,
        complex_id || null,
        title,
        diagnosis || null,
        surgery_date || null,
        current_phase || 1,
        notes || null,
        req.user.id
      ]
    );

    // Создаём начальный стрик
    await query(
      `INSERT INTO streaks (patient_id, program_id)
       VALUES ($1, $2)
       ON CONFLICT (patient_id, program_id) DO NOTHING`,
      [patient_id, result.rows[0].id]
    );

    res.status(201).json({ message: 'Программа создана', data: result.rows[0] });
  } catch (error) {
    console.error('Ошибка создания программы:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка создания программы' });
  }
});

/**
 * PUT /api/rehab/programs/:id
 * Обновить программу (фаза, статус, заметки)
 */
router.put('/programs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      diagnosis,
      surgery_date,
      current_phase,
      status,
      notes,
      complex_id
    } = req.body;

    // Проверяем доступ
    const checkResult = await query(
      `SELECT id, current_phase FROM rehab_programs WHERE id = $1 AND created_by = $2`,
      [id, req.user.id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Программа не найдена' });
    }

    const oldPhase = checkResult.rows[0].current_phase;

    const result = await query(
      `UPDATE rehab_programs SET
        title = COALESCE($1, title),
        diagnosis = COALESCE($2, diagnosis),
        surgery_date = COALESCE($3, surgery_date),
        current_phase = COALESCE($4, current_phase),
        status = COALESCE($5, status),
        notes = COALESCE($6, notes),
        complex_id = COALESCE($7, complex_id),
        phase_started_at = CASE WHEN $4 IS NOT NULL AND $4 != $8 THEN CURRENT_DATE ELSE phase_started_at END,
        updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        title || null,
        diagnosis || null,
        surgery_date || null,
        current_phase || null,
        status || null,
        notes || null,
        complex_id || null,
        oldPhase,
        id
      ]
    );

    res.json({ message: 'Программа обновлена', data: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления программы:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка обновления программы' });
  }
});

/**
 * DELETE /api/rehab/programs/:id
 * Мягкое удаление программы
 */
router.delete('/programs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE rehab_programs SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND created_by = $2
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Программа не найдена' });
    }

    res.json({ message: 'Программа удалена' });
  } catch (error) {
    console.error('Ошибка удаления программы:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка удаления программы' });
  }
});

// =====================================================
// ИНСТРУКТОР: Просмотр дневника пациента
// =====================================================

/**
 * GET /api/rehab/programs/:id/diary
 * Дневник пациента по программе (для инструктора)
 */
router.get('/programs/:id/diary', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    // Проверяем доступ
    const checkResult = await query(
      `SELECT patient_id FROM rehab_programs WHERE id = $1 AND created_by = $2`,
      [id, req.user.id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Программа не найдена' });
    }

    const patientId = checkResult.rows[0].patient_id;

    let sql = `SELECT * FROM diary_entries WHERE patient_id = $1`;
    const params = [patientId];

    if (from) {
      params.push(from);
      sql += ` AND entry_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND entry_date <= $${params.length}`;
    }

    sql += ` ORDER BY entry_date DESC`;

    const result = await query(sql, params);
    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Ошибка получения дневника пациента:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения дневника' });
  }
});

// =====================================================
// ИНСТРУКТОР: Сообщения
// =====================================================

/**
 * GET /api/rehab/programs/:id/messages
 * Сообщения по программе (для инструктора)
 */
router.get('/programs/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Проверяем доступ
    const checkResult = await query(
      `SELECT id FROM rehab_programs WHERE id = $1 AND created_by = $2`,
      [id, req.user.id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Программа не найдена' });
    }

    const result = await query(
      `SELECT m.*,
              CASE
                WHEN m.sender_type = 'patient' THEN p.full_name
                WHEN m.sender_type = 'instructor' THEN u.full_name
              END as sender_name
       FROM messages m
       LEFT JOIN patients p ON m.sender_type = 'patient' AND m.sender_id = p.id
       LEFT JOIN users u ON m.sender_type = 'instructor' AND m.sender_id = u.id
       WHERE m.program_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, parseInt(limit), parseInt(offset)]
    );

    // Отмечаем сообщения от пациента как прочитанные
    await query(
      `UPDATE messages SET is_read = true
       WHERE program_id = $1 AND sender_type = 'patient' AND is_read = false`,
      [id]
    );

    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Ошибка получения сообщений:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения сообщений' });
  }
});

/**
 * POST /api/rehab/programs/:id/messages
 * Отправить сообщение пациенту (от инструктора)
 */
router.post('/programs/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Validation Error', message: 'Текст сообщения обязателен' });
    }

    // Проверяем доступ
    const checkResult = await query(
      `SELECT id FROM rehab_programs WHERE id = $1 AND created_by = $2`,
      [id, req.user.id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Программа не найдена' });
    }

    const result = await query(
      `INSERT INTO messages (program_id, sender_type, sender_id, body)
       VALUES ($1, 'instructor', $2, $3)
       RETURNING *`,
      [id, req.user.id, body.trim()]
    );

    res.status(201).json({ message: 'Сообщение отправлено', data: result.rows[0] });
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка отправки сообщения' });
  }
});

// =====================================================
// УТИЛИТЫ
// =====================================================

/**
 * Безопасный парсинг JSON (для goals, restrictions и т.д.)
 */
function safeJsonParse(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [value];
  }
}

/**
 * Обновить стрик пациента
 */
async function updateStreak(patientId, programId, dateStr) {
  try {
    const today = new Date(dateStr);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Получаем текущий стрик
    const streakResult = await query(
      `SELECT * FROM streaks WHERE patient_id = $1 AND program_id = $2`,
      [patientId, programId]
    );

    if (streakResult.rows.length === 0) {
      // Создаём новый стрик
      await query(
        `INSERT INTO streaks (patient_id, program_id, current_streak, longest_streak, total_days, last_activity_date)
         VALUES ($1, $2, 1, 1, 1, $3)
         ON CONFLICT (patient_id, program_id) DO NOTHING`,
        [patientId, programId, dateStr]
      );
      return;
    }

    const streak = streakResult.rows[0];
    const lastDate = streak.last_activity_date
      ? new Date(streak.last_activity_date).toISOString().split('T')[0]
      : null;

    // Если уже отмечали сегодня — не обновляем
    if (lastDate === dateStr) return;

    let newCurrent = streak.current_streak || 0;

    if (lastDate === yesterdayStr) {
      // Продолжаем серию
      newCurrent += 1;
    } else {
      // Серия прервана — начинаем заново
      newCurrent = 1;
    }

    const newLongest = Math.max(streak.longest_streak || 0, newCurrent);
    const newTotal = (streak.total_days || 0) + 1;

    await query(
      `UPDATE streaks SET
        current_streak = $1,
        longest_streak = $2,
        total_days = $3,
        last_activity_date = $4,
        updated_at = NOW()
       WHERE patient_id = $5 AND program_id = $6`,
      [newCurrent, newLongest, newTotal, dateStr, patientId, programId]
    );
  } catch (error) {
    console.error('Ошибка обновления стрика:', error.message);
    // Не бросаем ошибку — стрик не критичен
  }
}

module.exports = router;
