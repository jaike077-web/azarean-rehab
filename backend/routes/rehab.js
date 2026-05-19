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
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { query, getClient } = require('../database/db');
const { authenticatePatient } = require('../middleware/patientAuth');
const { authenticateToken, authenticatePatientOrInstructor } = require('../middleware/auth');
const { diaryPhotoUpload, processDiaryPhoto } = require('../middleware/upload');
const { logAudit } = require('../utils/audit');
const { updateStreak, getStreakSummary } = require('../utils/streaks');
const { parseDurationWeeksUpper } = require('../utils/phaseDuration');
const { sendOpsAlert } = require('../utils/opsAlert');

// Whitelist для pain_entries.pain_character (TEXT[] после Wave 2 HF#9 v2 migration 20260520).
// Каждый элемент массива должен быть из enum. Backend CHECK constraint chk_pain_character_array
// проверяет array_length>0 + array <@ enum.
const PAIN_CHARACTER_VALUES = ['aching', 'sharp', 'burning', 'shooting', 'throbbing', 'other'];

// Whitelist для pain_entries.trigger_type (VARCHAR(50) enum).
// Сверено с CHECK constraint миграции 20260516_wave2_schema.
const TRIGGER_TYPE_VALUES = [
  'at_rest', 'on_flexion', 'on_extension', 'on_walking',
  'at_night', 'after_exercise', 'on_lifting', 'other'
];

// Человекочитаемые лейблы для Telegram alert куратору — иначе видит enum codes.
const TRIGGER_TYPE_LABELS = {
  at_rest: 'в покое',
  on_flexion: 'при сгибании',
  on_extension: 'при разгибании',
  on_walking: 'при ходьбе',
  at_night: 'ночью',
  after_exercise: 'после упражнений',
  on_lifting: 'при подъёме тяжести',
  other: 'другое',
};
const PAIN_CHARACTER_LABELS = {
  aching: 'ноющая',
  sharp: 'острая',
  burning: 'жгучая',
  shooting: 'простреливающая',
  throbbing: 'пульсирующая',
  other: 'другая',
};

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
              criteria_next, icon, color, color_bg, teaser,
              allowed, pain, daily, red_flags, faq
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
      allowed: safeJsonParse(phase.allowed),
      pain: safeJsonParse(phase.pain),
      daily: safeJsonParse(phase.daily),
      red_flags: safeJsonParse(phase.red_flags),
      faq: safeJsonParse(phase.faq),
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
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Validation Error', message: 'ID фазы должен быть числом' });
    }

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
 * GET /api/rehab/program-types
 * Справочник активных типов реабилитационных программ (Wave 1 commit 1.02).
 * Публичный — по образцу /phases/:id и /tips, не содержит чувствительных данных.
 * Используется в RehabProgramModal wizard (1.08) и AdminContent (1.05).
 */
router.get('/program-types', async (req, res) => {
  try {
    const result = await query(
      `SELECT code, label, joint, body_side_relevant, surgery_required, position
       FROM program_types
       WHERE is_active = true
       ORDER BY position ASC, code ASC`
    );

    res.json({
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Ошибка получения program_types:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения справочника программ' });
  }
});

/**
 * GET /api/rehab/program-templates — список активных шаблонов программ (Wave 1 #1.06)
 * Публичный (как program-types). Опциональный фильтр ?program_type=acl.
 * Используется в RehabProgramModal wizard (1.08b) и AdminContent (1.07).
 */
router.get('/program-templates', async (req, res) => {
  try {
    const { program_type } = req.query;
    let sql = `
      SELECT pt.id, pt.code, pt.program_type, pt.title, pt.description,
             pt.surgery_required, pt.default_phase_count, pt.variant_of,
             pt.position, pt.is_active,
             types.label AS program_type_label,
             types.joint AS program_joint
      FROM program_templates pt
      LEFT JOIN program_types types ON types.code = pt.program_type
      WHERE pt.is_active = true
    `;
    const params = [];
    if (program_type) {
      params.push(program_type);
      sql += ` AND pt.program_type = $${params.length}`;
    }
    sql += ' ORDER BY pt.position ASC, pt.title ASC';

    const result = await query(sql, params);
    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Ошибка получения program_templates:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения шаблонов программ' });
  }
});

/**
 * GET /api/rehab/program-templates/:id/phases — фазы шаблона + рекомендованные complex templates.
 * Используется wizard'ом (1.08b) для показа preview «что войдёт в программу».
 * Возвращает { template, phases: [{ phase_number, ..., recommended_complex }] }.
 */
router.get('/program-templates/:id/phases', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Невалидный id шаблона' });
    }

    const templateResult = await query(
      'SELECT * FROM program_templates WHERE id = $1 AND is_active = true',
      [id]
    );
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Шаблон программы не найден' });
    }
    const template = templateResult.rows[0];

    // Фазы из rehab_phases по program_type шаблона
    const phasesResult = await query(
      `SELECT phase_number, title, subtitle, duration_weeks, description, goals, restrictions
       FROM rehab_phases
       WHERE program_type = $1 AND is_active = true
       ORDER BY phase_number`,
      [template.program_type]
    );

    // Рекомендованные complex templates на каждой фазе
    const complexesResult = await query(
      `SELECT pc.phase_number, pc.complex_template_id, pc.is_recommended, pc.notes,
              t.id AS template_id, t.name AS template_name, t.description AS template_description
       FROM program_template_phase_complexes pc
       LEFT JOIN templates t ON t.id = pc.complex_template_id
       WHERE pc.program_template_id = $1`,
      [id]
    );

    const phasesWithComplexes = phasesResult.rows.map((phase) => {
      const rec = complexesResult.rows.find((c) => c.phase_number === phase.phase_number);
      return {
        ...phase,
        recommended_complex: rec
          ? {
              template_id: rec.template_id,
              name: rec.template_name,
              description: rec.template_description,
              notes: rec.notes,
            }
          : null,
      };
    });

    res.json({ data: { template, phases: phasesWithComplexes } });
  } catch (error) {
    console.error('Ошибка получения phases шаблона:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения фаз шаблона' });
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
 * @deprecated Wave 1 #1.02 заменил этот endpoint на GET /api/rehab/my/dashboard.
 * Фронт не вызывает getMyProgram() из services/api.js (0 callsites после Wave 1).
 * Endpoint оставлен на 2 версии для возможных прямых API-консьюмеров (скрипты,
 * тесты). Триггер удаления — после Wave 3 в проде стабильно. См. memory/
 * zombie_endpoint_my_program.md.
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

    // Получаем инфо о текущей фазе (Wave 1 retrospective: program_type из rp.*, не хардкод)
    const phaseResult = await query(
      `SELECT * FROM rehab_phases
       WHERE program_type = $1 AND phase_number = $2 AND is_active = true`,
      [program.program_type, program.current_phase]
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

    // 1. Активная программа + JOIN с program_types для получения label/joint/surgery_required
    const programResult = await query(
      `SELECT rp.id, rp.title, rp.diagnosis, rp.current_phase, rp.phase_started_at,
              rp.surgery_date, rp.status, rp.program_type,
              pt.label AS program_label,
              pt.joint AS program_joint,
              pt.surgery_required AS program_surgery_required
       FROM rehab_programs rp
       LEFT JOIN program_types pt ON pt.code = rp.program_type
       WHERE rp.patient_id = $1 AND rp.is_active = true AND rp.status = 'active'
       ORDER BY rp.created_at DESC LIMIT 1`,
      [patientId]
    );

    const program = programResult.rows[0] || null;

    if (program) {
      program.patient_name = req.patient.full_name;
      // program_label приходит из JOIN с program_types (Wave 1 #1.02).
      // Если NULL (теоретически невозможно из-за FK), фронт сам показывает
      // «Фаза N» без префикса label — HomeScreen.js уже имеет этот fallback.
    }

    // 2. Текущая фаза (если есть программа)
    // Wave 1 retrospective 2026-05-15: program_type из rp.*, не хардкод 'acl'
    let phase = null;
    if (program) {
      const phaseResult = await query(
        `SELECT id, phase_number, title, subtitle, duration_weeks, description, icon, color, color_bg
         FROM rehab_phases
         WHERE program_type = $1 AND phase_number = $2 AND is_active = true`,
        [program.program_type, program.current_phase]
      );
      phase = phaseResult.rows[0] || null;
      // Трансформация: фронтенд ожидает name, color2, duration_weeks как число
      if (phase) {
        phase.name = phase.title;
        phase.color2 = phase.color_bg || phase.color;
        phase.duration_weeks = parseInt(phase.duration_weeks) || 12;
      }
    }

    // 3. Стрик — getStreakSummary возвращает поля для UI:
    // current_streak, longest_streak, total_days, last_activity_date,
    // days_since_last_activity, missed_yesterday.
    const summary = await getStreakSummary(patientId);
    const streak = {
      current: summary.current_streak,
      best: summary.longest_streak,
      total_days: summary.total_days,
      last_activity_date: summary.last_activity_date,
      days_since_last_activity: summary.days_since_last_activity,
      missed_yesterday: summary.missed_yesterday,
      // atRisk оставляем для обратной совместимости с компонентами,
      // которые могут на него смотреть (>48ч с последней активности).
      atRisk: summary.days_since_last_activity !== null
        && summary.days_since_last_activity >= 2,
    };

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
      // Wave 1 retrospective 2026-05-15: program_type из program, 'general' остаётся sentinel.
      tipParams.push(program.program_type);
      tipSql += ` AND (program_type = $${tipParams.length} OR program_type = 'general')`;
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

    // 7. Сделаны ли упражнения сегодня? Смотрим на progress_logs.completed_at
    // за сегодня по комплексам этого пациента. Важнее чем diaryFilledToday
    // для hero-CTA на Home: сразу после комплекса Home должен переключиться
    // в ветку «Готово · Заполнить дневник».
    const todayProgressResult = await query(
      `SELECT 1 FROM progress_logs pl
         JOIN complexes c ON c.id = pl.complex_id
        WHERE c.patient_id = $1
          AND pl.completed = true
          AND pl.completed_at::date = $2
        LIMIT 1`,
      [patientId, today]
    );
    const exercisesDoneToday = todayProgressResult.rows.length > 0;

    res.json({
      data: {
        program,
        phase,
        streak,
        lastDiary,
        tip,
        diaryFilledToday,
        exercisesDoneToday,
      }
    });
  } catch (error) {
    console.error('Ошибка получения дашборда:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения дашборда' });
  }
});

/**
 * GET /api/rehab/my/stuck-status
 * Wave 0 commit 06: статус застревания пациента на текущей фазе.
 * is_stuck = NOW() > phase_started_at + duration_weeks_upper × 1.5.
 * Если нет программы / нет фазы / open-ended фаза («36+») — { is_stuck: false }.
 * Fallback: phase_started_at NULL → берём rehab_programs.created_at.
 */
router.get('/my/stuck-status', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    const programResult = await query(
      `SELECT id, program_type, current_phase, phase_started_at, created_at
       FROM rehab_programs
       WHERE patient_id = $1 AND status = 'active' AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [patientId]
    );

    if (programResult.rows.length === 0) {
      return res.json({ data: { is_stuck: false } });
    }

    const program = programResult.rows[0];

    const phaseResult = await query(
      `SELECT title, duration_weeks
       FROM rehab_phases
       WHERE program_type = $1 AND phase_number = $2 AND is_active = true
       LIMIT 1`,
      [program.program_type, program.current_phase]
    );

    if (phaseResult.rows.length === 0) {
      return res.json({ data: { is_stuck: false } });
    }

    const phase = phaseResult.rows[0];
    const durationWeeksUpper = parseDurationWeeksUpper(phase.duration_weeks);

    const phaseStartedAt = program.phase_started_at || program.created_at;
    const phaseStartDate = new Date(phaseStartedAt);
    const now = new Date();
    const daysOnPhase = Math.floor((now - phaseStartDate) / (1000 * 60 * 60 * 24));
    const actualWeeks = +(daysOnPhase / 7).toFixed(1);

    // Open-ended («36+») или unparseable → не считаем застрявшим
    const isStuck = durationWeeksUpper !== null
      ? daysOnPhase > (durationWeeksUpper * 7 * 1.5)
      : false;

    return res.json({
      data: {
        is_stuck: isStuck,
        current_phase: program.current_phase,
        phase_title: phase.title,
        actual_weeks: actualWeeks,
        expected_weeks: phase.duration_weeks, // отдаём оригинал ("0-2", "36+") для UI
        phase_started_at: phaseStartDate.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    console.error('Ошибка получения stuck-status:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения статуса фазы' });
  }
});

// =====================================================
// ПАЦИЕНТ: Дневник
// =====================================================

/**
 * GET /api/rehab/my/diary?from=2026-01-01&to=2026-02-10
 * Получить записи дневника за период.
 * Возвращает записи + массив `photos` (id + created_at) через json_agg
 * subquery. entry_date::text — TZ safety (правило проекта).
 */
router.get('/my/diary', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { from, to, limit = 30 } = req.query;

    let sql = `SELECT d.id, d.patient_id, d.program_id,
                      d.entry_date::text AS entry_date,
                      d.pain_level, d.swelling, d.mobility, d.mood,
                      d.exercises_done, d.sleep_quality, d.notes,
                      d.pgic_feel, d.rom_degrees, d.better_list, d.pain_when,
                      d.created_at, d.updated_at,
                      COALESCE(
                        (SELECT json_agg(json_build_object(
                           'id', dp.id,
                           'created_at', dp.created_at,
                           'file_size_bytes', dp.file_size_bytes
                         ) ORDER BY dp.id)
                         FROM diary_photos dp WHERE dp.diary_entry_id = d.id),
                        '[]'::json
                      ) AS photos
               FROM diary_entries d
               WHERE d.patient_id = $1`;
    const params = [patientId];

    if (from) {
      params.push(from);
      sql += ` AND d.entry_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND d.entry_date <= $${params.length}`;
    }

    sql += ` ORDER BY d.entry_date DESC`;
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
 * GET /api/rehab/my/diary/trend?days=14
 * Sparkline — уровень боли за последние N дней (default 14, max 90).
 * Выдача: массив { date: "YYYY-MM-DD", pain: number }.
 *
 * ВАЖНО: этот роут должен идти ДО `/my/diary/:date`, иначе Express
 * примет 'trend' как :date и вернёт 400/пустой результат.
 */
router.get('/my/diary/trend', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const daysRaw = parseInt(req.query.days, 10);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 90) : 14;

    const result = await query(
      `SELECT entry_date::text AS date, pain_level AS pain
         FROM diary_entries
        WHERE patient_id = $1
          AND entry_date > CURRENT_DATE - (INTERVAL '1 day' * $2)
        ORDER BY entry_date ASC`,
      [patientId, days]
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Ошибка получения тренда дневника:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения тренда' });
  }
});

/**
 * POST /api/rehab/my/diary
 * Создать/обновить запись дневника за день (UPSERT)
 */
// Allowlist для better_list (что стало лучше) — фронт должен отправлять
// только эти строки. Любые другие → 400.
const BETTER_LIST_ALLOWED = ['ext', 'walk', 'sleep', 'mood', 'pain', 'custom'];
const PGIC_ALLOWED = ['better', 'same', 'worse'];
const PAIN_WHEN_ALLOWED = ['morning', 'day', 'evening', 'exercise', 'walking'];

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
      notes,
      // Structured v12 поля (Checkpoint 6)
      pgic_feel,
      rom_degrees,
      better_list,
      pain_when,
    } = req.body;

    const date = entry_date || new Date().toISOString().split('T')[0];

    // Валидация
    if (pain_level !== undefined && pain_level !== null && (pain_level < 0 || pain_level > 10)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Уровень боли должен быть от 0 до 10', debug: { pain_level } });
    }
    if (mood !== undefined && mood !== null && (mood < 1 || mood > 5)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Настроение должно быть от 1 до 5', debug: { mood } });
    }
    // swelling CHECK constraint: 0..3. Если пришла строка или >3 — 400 понятнее чем 500 от БД.
    if (swelling !== undefined && swelling !== null) {
      const s = Number(swelling);
      if (!Number.isFinite(s) || s < 0 || s > 3) {
        return res.status(400).json({ error: 'Validation Error', message: 'Swelling 0..3', debug: { swelling } });
      }
    }
    // mobility CHECK: 0..10
    if (mobility !== undefined && mobility !== null) {
      const m = Number(mobility);
      if (!Number.isFinite(m) || m < 0 || m > 10) {
        return res.status(400).json({ error: 'Validation Error', message: 'Mobility 0..10', debug: { mobility } });
      }
    }
    // sleep_quality CHECK: 1..5
    if (sleep_quality !== undefined && sleep_quality !== null) {
      const sq = Number(sleep_quality);
      if (!Number.isFinite(sq) || sq < 1 || sq > 5) {
        return res.status(400).json({ error: 'Validation Error', message: 'Sleep quality 1..5', debug: { sleep_quality } });
      }
    }
    // pgic_feel enum
    if (pgic_feel !== undefined && pgic_feel !== null && !PGIC_ALLOWED.includes(pgic_feel)) {
      return res.status(400).json({ error: 'Validation Error', message: 'pgic_feel must be better/same/worse', debug: { pgic_feel } });
    }
    // rom_degrees: 0..180
    if (rom_degrees !== undefined && rom_degrees !== null) {
      const r = Number(rom_degrees);
      if (!Number.isFinite(r) || r < 0 || r > 180) {
        return res.status(400).json({ error: 'Validation Error', message: 'ROM 0..180°', debug: { rom_degrees } });
      }
    }
    // better_list: массив строк из allowlist
    if (better_list !== undefined && better_list !== null) {
      if (!Array.isArray(better_list)) {
        return res.status(400).json({ error: 'Validation Error', message: 'better_list must be array', debug: { better_list } });
      }
      const bad = better_list.find((x) => typeof x !== 'string' || !BETTER_LIST_ALLOWED.includes(x));
      if (bad !== undefined) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `better_list может содержать только: ${BETTER_LIST_ALLOWED.join(', ')}`,
          debug: { invalid: bad },
        });
      }
    }
    // pain_when enum
    if (pain_when !== undefined && pain_when !== null && !PAIN_WHEN_ALLOWED.includes(pain_when)) {
      return res.status(400).json({ error: 'Validation Error', message: 'pain_when must be morning/day/evening/exercise/walking', debug: { pain_when } });
    }

    // Находим активную программу
    const programResult = await query(
      `SELECT id FROM rehab_programs
       WHERE patient_id = $1 AND is_active = true AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [patientId]
    );
    const programId = programResult.rows[0]?.id || null;

    // better_list в JSONB ждёт JSON-строку или NULL, не ставим default в
    // COALESCE — COALESCE с JSONB '[]' мешает update'ить массив в пустоту.
    // Если not provided — пропускаем в UPDATE через EXCLUDED IS NULL guard.
    const betterListJson = better_list !== undefined && better_list !== null
      ? JSON.stringify(better_list)
      : null;

    // UPSERT: одна запись в день.
    // COALESCE сохраняет старое значение если новое не прислано (null).
    // Для JSONB better_list — отдельная логика, т.к. пустой массив '[]' не
    // должен считаться "не прислано" — если фронт прислал [], обнуляем.
    const result = await query(
      `INSERT INTO diary_entries
       (patient_id, program_id, entry_date,
        pain_level, swelling, mobility, mood, exercises_done,
        sleep_quality, notes,
        pgic_feel, rom_degrees, better_list, pain_when)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, COALESCE($13::jsonb, '[]'::jsonb), $14)
       ON CONFLICT (patient_id, entry_date)
       DO UPDATE SET
         pain_level = COALESCE(EXCLUDED.pain_level, diary_entries.pain_level),
         swelling = COALESCE(EXCLUDED.swelling, diary_entries.swelling),
         mobility = COALESCE(EXCLUDED.mobility, diary_entries.mobility),
         mood = COALESCE(EXCLUDED.mood, diary_entries.mood),
         exercises_done = COALESCE(EXCLUDED.exercises_done, diary_entries.exercises_done),
         sleep_quality = COALESCE(EXCLUDED.sleep_quality, diary_entries.sleep_quality),
         notes = COALESCE(EXCLUDED.notes, diary_entries.notes),
         pgic_feel = COALESCE(EXCLUDED.pgic_feel, diary_entries.pgic_feel),
         rom_degrees = COALESCE(EXCLUDED.rom_degrees, diary_entries.rom_degrees),
         better_list = CASE
           WHEN $13::jsonb IS NOT NULL THEN EXCLUDED.better_list
           ELSE diary_entries.better_list
         END,
         pain_when = COALESCE(EXCLUDED.pain_when, diary_entries.pain_when),
         updated_at = NOW()
       RETURNING *`,
      [
        patientId, programId, date,
        pain_level ?? null, swelling ?? null, mobility ?? null, mood ?? null, exercises_done ?? null,
        sleep_quality ?? null, notes ?? null,
        pgic_feel ?? null, rom_degrees ?? null, betterListJson, pain_when ?? null,
      ]
    );

    // Любое сохранение дневника считается активностью пациента в этот день.
    // Старое условие `if (exercises_done)` мёртвое: в v12-DiaryScreen чекбокс
    // «упражнения сделаны» удалён, флаг всегда false → стрик не рос. Регресс
    // закрыт переходом на streak_days (Wave 0 commit 01).
    await updateStreak(patientId, programId, 'diary');

    res.status(201).json({ message: 'Запись сохранена', data: result.rows[0] });
  } catch (error) {
    // Детальный лог + возврат code для диагностики. В prod можно урезать.
    console.error('Ошибка сохранения дневника:', error.message, error.code, error.detail || '');
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка сохранения записи дневника',
      debug: process.env.NODE_ENV !== 'production' ? { code: error.code, detail: error.detail, message: error.message } : undefined,
    });
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
      `SELECT d.*, d.entry_date::text AS entry_date,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'id', dp.id,
                   'created_at', dp.created_at,
                   'file_size_bytes', dp.file_size_bytes
                 ) ORDER BY dp.id)
                 FROM diary_photos dp WHERE dp.diary_entry_id = d.id),
                '[]'::json
              ) AS photos
         FROM diary_entries d
        WHERE d.patient_id = $1 AND d.entry_date = $2`,
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
// ПАЦИЕНТ: Фото дневника (Checkpoint 6)
// =====================================================

const PHOTOS_PER_ENTRY = 3;

/**
 * Helper: проверяет, что entry_id принадлежит текущему пациенту.
 * Возвращает либо { ownershipOk: true, entryId } либо отдаёт 400/404
 * и возвращает null (вызывающая сторона должна вернуть сразу).
 */
async function verifyDiaryOwnership(req, res) {
  const entryId = parseInt(req.params.entry_id, 10);
  if (!Number.isFinite(entryId)) {
    res.status(400).json({ error: 'Validation Error', message: 'Некорректный ID записи' });
    return null;
  }
  const ownership = await query(
    'SELECT patient_id FROM diary_entries WHERE id = $1',
    [entryId]
  );
  if (ownership.rows.length === 0 || ownership.rows[0].patient_id !== req.patient.id) {
    res.status(404).json({ error: 'Not Found', message: 'Запись не найдена' });
    return null;
  }
  return entryId;
}

/**
 * POST /api/rehab/my/diary/:entry_id/photos
 * Загружает фото и привязывает к записи дневника. Max 3 на запись (enforce
 * в application — БД отдельного constraint'а не имеет). 10 МБ до sharp,
 * результат ~200-400 КБ (fit:inside 1200×1200, JPEG q82).
 */
router.post('/my/diary/:entry_id/photos',
  authenticatePatient,
  diaryPhotoUpload.single('photo'),
  processDiaryPhoto,
  async (req, res) => {
    try {
      const entryId = await verifyDiaryOwnership(req, res);
      if (entryId === null) return;

      if (!req.file) {
        return res.status(400).json({ error: 'Validation Error', message: 'Файл не прислан' });
      }

      const countResult = await query(
        'SELECT COUNT(*)::int AS n FROM diary_photos WHERE diary_entry_id = $1',
        [entryId]
      );
      if (countResult.rows[0].n >= PHOTOS_PER_ENTRY) {
        // Удалим только что загруженный файл — он уже на диске, в БД не записан
        try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
        return res.status(400).json({
          error: 'Validation Error',
          message: `Максимум ${PHOTOS_PER_ENTRY} фото на запись`,
        });
      }

      const insertResult = await query(
        `INSERT INTO diary_photos (diary_entry_id, file_path, file_size_bytes)
         VALUES ($1, $2, $3)
         RETURNING id, file_path, file_size_bytes, created_at`,
        [entryId, req.file.relativePath, req.file.size]
      );

      res.status(201).json({
        data: {
          id: insertResult.rows[0].id,
          created_at: insertResult.rows[0].created_at,
          file_size_bytes: insertResult.rows[0].file_size_bytes,
        },
      });
    } catch (error) {
      console.error('Ошибка загрузки фото дневника:', error.message);
      // Если файл успели записать на диск — чистим
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
      }
      res.status(500).json({ error: 'Server Error', message: 'Ошибка загрузки фото' });
    }
  }
);

/**
 * GET /api/rehab/my/diary/:entry_id/photos/:photo_id
 * Отдаёт файл-blob с cookie-auth (как аватары). Не static, потому что
 * /uploads/diary_photos должен быть защищён от прямого чтения.
 */
router.get('/my/diary/:entry_id/photos/:photo_id', authenticatePatient, async (req, res) => {
  try {
    const entryId = await verifyDiaryOwnership(req, res);
    if (entryId === null) return;

    const photoId = parseInt(req.params.photo_id, 10);
    if (!Number.isFinite(photoId)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Некорректный ID фото' });
    }

    const result = await query(
      'SELECT file_path FROM diary_photos WHERE id = $1 AND diary_entry_id = $2',
      [photoId, entryId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Фото не найдено' });
    }

    const filePath = path.join(__dirname, '..', result.rows[0].file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not Found', message: 'Файл отсутствует' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Ошибка отдачи фото:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения фото' });
  }
});

/**
 * DELETE /api/rehab/my/diary/:entry_id/photos/:photo_id
 * Удаляет файл с диска + запись в БД. Требует ownership.
 */
router.delete('/my/diary/:entry_id/photos/:photo_id', authenticatePatient, async (req, res) => {
  try {
    const entryId = await verifyDiaryOwnership(req, res);
    if (entryId === null) return;

    const photoId = parseInt(req.params.photo_id, 10);
    if (!Number.isFinite(photoId)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Некорректный ID фото' });
    }

    const result = await query(
      'SELECT file_path FROM diary_photos WHERE id = $1 AND diary_entry_id = $2',
      [photoId, entryId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Фото не найдено' });
    }

    const filePath = path.join(__dirname, '..', result.rows[0].file_path);
    try { fs.unlinkSync(filePath); } catch (_) { /* файл уже удалён — ок */ }

    await query('DELETE FROM diary_photos WHERE id = $1', [photoId]);

    res.json({ message: 'Фото удалено' });
  } catch (error) {
    console.error('Ошибка удаления фото:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка удаления фото' });
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
    const summary = await getStreakSummary(patientId);

    // Дополнительно: список стриков по всем программам — оставляем для
    // совместимости со старыми клиентами (раньше эндпоинт возвращал programs[]).
    const programsResult = await query(
      `SELECT s.*, rp.title as program_title
         FROM streaks s
         LEFT JOIN rehab_programs rp ON s.program_id = rp.id
        WHERE s.patient_id = $1
        ORDER BY s.current_streak DESC`,
      [patientId]
    );

    res.json({
      data: {
        ...summary,
        programs: programsResult.rows,
      },
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

    // m.* включает message_kind, linked_diary_id, channel.
    // JOIN на diary_entries возвращает entry_date как text, чтобы избежать
    // проблем с часовым поясом в JSON-сериализации (правило проекта —
    // PostgreSQL DATE → text когда отдаём клиенту).
    //
    // linked_diary_date — flat-поле для обратной совместимости (есть тесты).
    // linked_diary — hydrated объект для рендера карточки diary_report
    // в ContactScreen (Wave 0 commit 03).
    let sql = `SELECT m.*,
                CASE
                  WHEN m.sender_type = 'patient' THEN p.full_name
                  WHEN m.sender_type = 'instructor' THEN u.full_name
                END as sender_name,
                de.entry_date::text AS linked_diary_date,
                CASE
                  WHEN m.linked_diary_id IS NOT NULL AND de.id IS NOT NULL THEN
                    json_build_object(
                      'id', de.id,
                      'entry_date', de.entry_date::text,
                      'pain_level', de.pain_level
                    )
                  ELSE NULL
                END AS linked_diary
               FROM messages m
               LEFT JOIN patients p ON m.sender_type = 'patient' AND m.sender_id = p.id
               LEFT JOIN users u ON m.sender_type = 'instructor' AND m.sender_id = u.id
               LEFT JOIN diary_entries de ON de.id = m.linked_diary_id
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
    const {
      program_id,
      body,
      message_kind = 'text',
      linked_diary_id = null,
    } = req.body;

    if (!program_id || !body || !body.trim()) {
      return res.status(400).json({ error: 'Validation Error', message: 'Программа и текст сообщения обязательны' });
    }

    if (body.trim().length > 5000) {
      return res.status(400).json({ error: 'Validation Error', message: 'Сообщение слишком длинное (макс. 5000 символов)' });
    }

    // Whitelist message_kind. session_report зарезервирован для Волны 3,
    // патиентский endpoint в Волне 0 принимает только text и diary_report.
    const allowedKinds = ['text', 'diary_report'];
    if (!allowedKinds.includes(message_kind)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'message_kind должен быть один из: ' + allowedKinds.join(', '),
      });
    }

    // Для diary_report linked_diary_id обязателен и должен принадлежать
    // этому пациенту (ownership check) — иначе можно «прицепить» отчёт
    // к чужой записи дневника.
    let linkedDiaryId = null;
    if (message_kind === 'diary_report') {
      if (!linked_diary_id || !Number.isInteger(linked_diary_id)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'для diary_report обязателен linked_diary_id',
        });
      }

      const ownership = await query(
        `SELECT id FROM diary_entries WHERE id = $1 AND patient_id = $2`,
        [linked_diary_id, patientId]
      );
      if (ownership.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'запись дневника не найдена',
        });
      }
      linkedDiaryId = linked_diary_id;
    }

    // Проверяем доступ к программе
    const checkResult = await query(
      `SELECT id FROM rehab_programs WHERE id = $1 AND patient_id = $2`,
      [program_id, patientId]
    );
    if (checkResult.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden', message: 'Нет доступа к этой программе' });
    }

    const result = await query(
      `INSERT INTO messages (program_id, sender_type, sender_id, body, message_kind, linked_diary_id)
       VALUES ($1, 'patient', $2, $3, $4, $5)
       RETURNING *`,
      [program_id, patientId, body.trim(), message_kind, linkedDiaryId]
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
               LEFT JOIN rehab_phases ph ON ph.program_type = rp.program_type
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
      notes,
      program_type,           // Wave 1 #1.01 — может прийти явно (приоритет) или резолвится из шаблона
      program_template_id,    // Wave 1 #1.06 — tracking источника
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

    // Wave 1 #1.06: если указан program_template_id — валидируем и резолвим program_type из шаблона.
    // Явный program_type в body имеет приоритет (для edge cases).
    let resolvedProgramType = program_type;
    if (program_template_id) {
      const tplCheck = await query(
        'SELECT id, program_type FROM program_templates WHERE id = $1 AND is_active = true',
        [program_template_id]
      );
      if (tplCheck.rows.length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Шаблон программы не найден или деактивирован',
        });
      }
      if (!resolvedProgramType) {
        resolvedProgramType = tplCheck.rows[0].program_type;
      }
    }

    const result = await query(
      `INSERT INTO rehab_programs
       (patient_id, complex_id, title, diagnosis, surgery_date, current_phase, notes, created_by,
        program_type, program_template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'acl'), $10)
       RETURNING *`,
      [
        patient_id,
        complex_id || null,
        title,
        diagnosis || null,
        surgery_date || null,
        current_phase || 1,
        notes || null,
        req.user.id,
        resolvedProgramType || null,
        program_template_id || null,
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

/**
 * GET /api/rehab/programs/:id/stuck-status
 * Wave 1 #1.09: инструкторская сторона stuck detection.
 * yellow=true при > 1.3×duration_weeks_upper, red=true при > 1.7×.
 * Open-ended фазы («36+») → { yellow: false, red: false }.
 * Только для программ, созданных текущим инструктором (created_by check).
 */
router.get('/programs/:id/stuck-status', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Некорректный id программы' });
    }

    // Ownership check + берём program_type из самой записи (Wave 1 #1.01)
    const programResult = await query(
      `SELECT id, program_type, current_phase, phase_started_at, created_at
       FROM rehab_programs
       WHERE id = $1 AND created_by = $2 AND is_active = true`,
      [id, req.user.id]
    );

    if (programResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Программа не найдена' });
    }

    const { computeStuckStatus } = require('../services/stuckDetection');
    const status = await computeStuckStatus(programResult.rows[0]);

    res.json({ data: status });
  } catch (error) {
    console.error('Ошибка получения stuck-status (instructor):', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения статуса фазы' });
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

    // GDPR: лог чтения дневника пациента инструктором
    logAudit(req, 'READ', 'diary', parseInt(id, 10), {
      patientId,
      details: { entries: result.rows.length, from: from || null, to: to || null },
    });
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

    // Проверяем доступ + достаём patient_id для аудит-лога
    const checkResult = await query(
      `SELECT id, patient_id FROM rehab_programs WHERE id = $1 AND created_by = $2`,
      [id, req.user.id]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Программа не найдена' });
    }
    const msgPatientId = checkResult.rows[0].patient_id;

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

    // GDPR: лог чтения переписки с пациентом
    logAudit(req, 'READ', 'messages', parseInt(id, 10), {
      patientId: msgPatientId,
      details: { count: result.rows.length },
    });
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

// =====================================================
// ПАЦИЕНТ: Упражнения активной программы реабилитации
// =====================================================

/**
 * GET /api/rehab/my/exercises
 * Возвращает "сегодняшний" комплекс — тот, что прикреплён к активной
 * rehab_programs пациента. Включает полный список упражнений.
 * 404 если активной программы с complex_id нет.
 */
router.get('/my/exercises', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    const result = await query(
      `SELECT rp.id as program_id,
              rp.complex_id,
              rp.title as program_title,
              c.title as complex_title,
              c.diagnosis_note,
              c.recommendations,
              c.warnings,
              d.name as diagnosis_name,
              u.full_name as instructor_name,
              json_agg(
                json_build_object(
                  'id', ce.id,
                  'order_number', ce.order_number,
                  'sets', ce.sets,
                  'reps', ce.reps,
                  'duration_seconds', ce.duration_seconds,
                  'rest_seconds', ce.rest_seconds,
                  'notes', ce.notes,
                  'exercise', json_build_object(
                    'id', e.id,
                    'title', e.title,
                    'description', e.description,
                    'video_url', e.video_url,
                    'thumbnail_url', e.thumbnail_url,
                    'kinescope_id', e.kinescope_id,
                    'exercise_type', e.exercise_type,
                    'difficulty_level', e.difficulty_level,
                    'equipment', e.equipment,
                    'instructions', e.instructions,
                    'cues', e.cues,
                    'tips', e.tips,
                    'contraindications', e.contraindications,
                    'absolute_contraindications', e.absolute_contraindications,
                    'red_flags', e.red_flags,
                    'safe_with_inflammation', e.safe_with_inflammation
                  )
                ) ORDER BY ce.order_number
              ) as exercises
       FROM rehab_programs rp
       JOIN complexes c ON c.id = rp.complex_id
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN users u ON c.instructor_id = u.id
       LEFT JOIN complex_exercises ce ON ce.complex_id = c.id
       LEFT JOIN exercises e ON ce.exercise_id = e.id
       WHERE rp.patient_id = $1 AND rp.status = 'active' AND rp.is_active = true
         AND c.is_active = true
       GROUP BY rp.id, rp.complex_id, rp.title, c.title, c.diagnosis_note,
                c.recommendations, c.warnings, d.name, u.full_name, rp.created_at
       ORDER BY rp.created_at DESC
       LIMIT 1`,
      [patientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Активная программа с комплексом не найдена',
      });
    }

    const row = result.rows[0];
    // Если упражнений нет, json_agg вернёт [{... exercise: null ...}] — нормализуем
    const exercises = Array.isArray(row.exercises) && row.exercises[0]?.exercise
      ? row.exercises
      : [];

    res.json({
      data: {
        program_id: row.program_id,
        complex_id: row.complex_id,
        program_title: row.program_title,
        complex_title: row.complex_title,
        diagnosis_name: row.diagnosis_name,
        diagnosis_note: row.diagnosis_note,
        recommendations: row.recommendations,
        warnings: row.warnings,
        instructor_name: row.instructor_name,
        exercise_count: exercises.length,
        exercises,
      },
    });
  } catch (error) {
    console.error('Ошибка получения упражнений:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения упражнений' });
  }
});

// ============================================================================
// PAIN endpoints (Wave 2 коммит 2.04)
// Два режима: daily diary (UPSERT, один в день) + event SOS (INSERT, многократно).
// Red-flag automation через существующий utils/opsAlert.js — дедуп + hourly cap.
// ============================================================================

/**
 * Helper: trigger red-flag pain alert.
 * - await sendOpsAlert(title, body) — fire-and-forget, дедуп+hourly cap в utils
 * - INSERT в ops_alerts с source_entity_id=pain_entry.id для admin триажа
 * Возвращает ops_alert.id или null если INSERT упал (Telegram уже ушёл — независимо).
 */
async function triggerRedFlagAlert({ patient, pain_entry, red_flag_locs, is_event }) {
  const modeLabel = is_event ? 'Pain Event' : 'Daily diary';
  const title = `🚨 RED FLAG: ${patient.full_name || 'Пациент'} (ID ${patient.id})`;
  const redFlagDescriptions = red_flag_locs
    .map(l => `• ${l.label} — ${l.red_flag_reason || 'причина не указана'}`)
    .join('\n');
  const notesLine = pain_entry.notes ? `\nЗаметка: ${pain_entry.notes}` : '';
  const triggerLine = pain_entry.trigger_type
    ? `\nТриггер: ${TRIGGER_TYPE_LABELS[pain_entry.trigger_type] || pain_entry.trigger_type}`
    : '';
  // Wave 2 HF#9 v2 — pain_character теперь TEXT[]. Label loop по элементам.
  const characterLine = Array.isArray(pain_entry.pain_character) && pain_entry.pain_character.length > 0
    ? `\nХарактер: ${pain_entry.pain_character.map((c) => PAIN_CHARACTER_LABELS[c] || c).join(', ')}`
    : '';
  const phoneLine = patient.phone ? `\nТелефон: ${patient.phone}` : '';

  const body =
    `Режим: ${modeLabel}\n` +
    `VAS: ${pain_entry.vas_score}/10\n` +
    `Локации с красным флагом:\n${redFlagDescriptions}` +
    triggerLine + characterLine + notesLine + phoneLine +
    `\n\nДействие: связаться с пациентом, оценить состояние.\n` +
    `Pain entry ID: ${pain_entry.id} (${new Date(pain_entry.created_at).toLocaleString('ru-RU')})`;

  try {
    await sendOpsAlert(title, body);
  } catch (err) {
    console.error('[triggerRedFlagAlert] sendOpsAlert threw:', err.message);
  }

  try {
    const { rows } = await query(
      `INSERT INTO ops_alerts
         (patient_id, alert_type, severity, source_entity_type, source_entity_id,
          details, telegram_attempted_at)
       VALUES ($1, 'red_flag_pain', 'high', 'pain_entry', $2, $3, NOW())
       RETURNING id`,
      [
        patient.id,
        pain_entry.id,
        JSON.stringify({
          vas_score: pain_entry.vas_score,
          notes: pain_entry.notes,
          trigger_type: pain_entry.trigger_type,
          is_event,
          red_flag_locations: red_flag_locs.map(l => ({
            code: l.code, label: l.label, reason: l.red_flag_reason
          }))
        })
      ]
    );
    return rows[0].id;
  } catch (err) {
    console.error('[triggerRedFlagAlert] ops_alerts INSERT failed:', err.message);
    return null;
  }
}

/**
 * GET /api/rehab/my/pain-locations
 * Active локации боли для program_type активной программы пациента.
 * Источник program_type — rehab_programs.program_type (Wave 1 #1.01).
 */
router.get('/my/pain-locations', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    const ptRes = await query(
      `SELECT program_type FROM rehab_programs
       WHERE patient_id = $1 AND is_active = TRUE
       ORDER BY created_at DESC LIMIT 1`,
      [patientId]
    );

    const programType = ptRes.rows[0]?.program_type;
    if (!programType) {
      return res.json({ data: [], total: 0 });
    }

    const { rows } = await query(
      `SELECT code, program_type, label, position, is_red_flag
       FROM pain_locations
       WHERE program_type = $1 AND is_active = TRUE
       ORDER BY position, code`,
      [programType]
    );
    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('GET /rehab/my/pain-locations error:', err.message);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить локации' });
  }
});

/**
 * POST /api/rehab/my/pain/daily
 * UPSERT daily entry. Race-safe через SELECT FOR UPDATE → UPDATE/INSERT.
 * Один daily в день на пациента (партиал-UNIQUE `(patient_id, entry_date) WHERE is_event=false`).
 * Body: { vas_score (req, 0..10), notes?, location_codes?, pain_character?, program_id? }
 * red_flag_triggered sticky — если ранее был true и сейчас локаций red-flag нет, остаётся true.
 */
router.post('/my/pain/daily', authenticatePatient, async (req, res) => {
  const { vas_score, notes, location_codes, pain_character, program_id } = req.body;

  if (typeof vas_score !== 'number' || vas_score < 0 || vas_score > 10) {
    return res.status(400).json({ error: 'ValidationError', message: 'vas_score обязателен (число 0..10)' });
  }
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string' || notes.length > 1000) {
      return res.status(400).json({ error: 'ValidationError', message: 'notes ≤ 1000 символов' });
    }
  }
  if (location_codes !== undefined && location_codes !== null) {
    if (!Array.isArray(location_codes) || location_codes.length > 16) {
      return res.status(400).json({ error: 'ValidationError', message: 'location_codes — массив до 16' });
    }
  }
  // Wave 2 HF#9 v2 — pain_character теперь массив (TEXT[] в БД).
  if (pain_character !== undefined && pain_character !== null) {
    if (!Array.isArray(pain_character)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'pain_character должен быть массивом'
      });
    }
    if (pain_character.length === 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'pain_character пустой массив — передавай null'
      });
    }
    const invalidChars = pain_character.filter((v) => !PAIN_CHARACTER_VALUES.includes(v));
    if (invalidChars.length > 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: `Неизвестные значения pain_character: ${invalidChars.join(', ')}`
      });
    }
  }

  const patientId = req.patient.id;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let locsFound = [];
    if (Array.isArray(location_codes) && location_codes.length > 0) {
      const locsRes = await client.query(
        `SELECT code, label, position, is_red_flag, red_flag_reason
         FROM pain_locations
         WHERE code = ANY($1) AND is_active = TRUE`,
        [location_codes]
      );
      locsFound = locsRes.rows;
      const found = new Set(locsFound.map(l => l.code));
      const missing = location_codes.filter(c => !found.has(c));
      if (missing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'ValidationError',
          message: `Неизвестные/неактивные локации: ${missing.join(', ')}`
        });
      }
    }

    const redFlagLocs = locsFound.filter(l => l.is_red_flag);
    const newRedFlag = redFlagLocs.length > 0;

    // Race-safe lookup существующей daily-записи
    const existingRes = await client.query(
      `SELECT id, created_at, red_flag_triggered
       FROM pain_entries
       WHERE patient_id = $1 AND entry_date = CURRENT_DATE AND is_event = FALSE
       FOR UPDATE`,
      [patientId]
    );

    let painEntry;
    if (existingRes.rows.length > 0) {
      const existingId = existingRes.rows[0].id;
      const prevRedFlag = existingRes.rows[0].red_flag_triggered === true;
      const upRes = await client.query(
        `UPDATE pain_entries
         SET vas_score = $1, notes = $2, pain_character = $3, program_id = $4,
             red_flag_triggered = $5, updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          vas_score,
          notes ?? null,
          pain_character ?? null,
          program_id ?? null,
          prevRedFlag || newRedFlag, // sticky
          existingId
        ]
      );
      painEntry = upRes.rows[0];
    } else {
      const insRes = await client.query(
        `INSERT INTO pain_entries
           (patient_id, program_id, entry_date, is_event,
            vas_score, notes, pain_character, red_flag_triggered)
         VALUES ($1, $2, CURRENT_DATE, FALSE, $3, $4, $5, $6)
         RETURNING *`,
        [
          patientId,
          program_id ?? null,
          vas_score,
          notes ?? null,
          pain_character ?? null,
          newRedFlag
        ]
      );
      painEntry = insRes.rows[0];
    }

    // Локации — clear + reinsert
    await client.query(
      `DELETE FROM pain_entry_locations WHERE pain_entry_id = $1`,
      [painEntry.id]
    );
    for (const loc of locsFound) {
      await client.query(
        `INSERT INTO pain_entry_locations (pain_entry_id, location_code) VALUES ($1, $2)`,
        [painEntry.id, loc.code]
      );
    }

    await client.query('COMMIT');

    // Red-flag automation — после COMMIT, не откатывает pain_entry при failure
    let opsAlertId = null;
    if (newRedFlag) {
      const patRes = await query(
        `SELECT id, full_name, phone, email FROM patients WHERE id = $1`,
        [patientId]
      );
      opsAlertId = await triggerRedFlagAlert({
        patient: patRes.rows[0],
        pain_entry: painEntry,
        red_flag_locs: redFlagLocs,
        is_event: false
      });

      if (opsAlertId) {
        await query(
          `UPDATE pain_entries SET ops_alert_sent_at = NOW() WHERE id = $1`,
          [painEntry.id]
        );
      }
    }

    return res.status(201).json({
      data: {
        ...painEntry,
        locations: locsFound.map(l => ({
          code: l.code, label: l.label, is_red_flag: l.is_red_flag
        })),
        ops_alert_id: opsAlertId
      },
      message: newRedFlag
        ? 'Запись в дневнике сохранена. Куратор получит уведомление о красном флаге.'
        : 'Запись в дневнике сохранена'
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /rehab/my/pain/daily error:', err.message);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось сохранить запись' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/rehab/my/pain/event
 * INSERT event SOS. is_event=TRUE → не подпадает под daily UNIQUE.
 * Body: { vas_score (req), location_codes (req, ≥1), notes?, trigger_type?, pain_character?, photo_url?, program_id? }
 */
router.post('/my/pain/event', authenticatePatient, async (req, res) => {
  const {
    vas_score, location_codes, notes, trigger_type, pain_character, photo_url, program_id
  } = req.body;

  if (typeof vas_score !== 'number' || vas_score < 0 || vas_score > 10) {
    return res.status(400).json({ error: 'ValidationError', message: 'vas_score обязателен (число 0..10)' });
  }
  if (!Array.isArray(location_codes) || location_codes.length === 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'location_codes обязательны для pain event (минимум 1)'
    });
  }
  if (location_codes.length > 16) {
    return res.status(400).json({ error: 'ValidationError', message: 'не больше 16 локаций' });
  }
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string' || notes.length > 1000) {
      return res.status(400).json({ error: 'ValidationError', message: 'notes ≤ 1000 символов' });
    }
  }
  if (trigger_type !== undefined && trigger_type !== null) {
    if (typeof trigger_type !== 'string' || !TRIGGER_TYPE_VALUES.includes(trigger_type)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: `trigger_type: одно из ${TRIGGER_TYPE_VALUES.join('|')}`
      });
    }
  }
  if (photo_url !== undefined && photo_url !== null) {
    if (typeof photo_url !== 'string' || photo_url.length > 500) {
      return res.status(400).json({ error: 'ValidationError', message: 'photo_url ≤ 500 символов' });
    }
  }
  // Wave 2 HF#9 v2 — pain_character теперь массив (TEXT[] в БД).
  if (pain_character !== undefined && pain_character !== null) {
    if (!Array.isArray(pain_character)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'pain_character должен быть массивом'
      });
    }
    if (pain_character.length === 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'pain_character пустой массив — передавай null'
      });
    }
    const invalidChars = pain_character.filter((v) => !PAIN_CHARACTER_VALUES.includes(v));
    if (invalidChars.length > 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: `Неизвестные значения pain_character: ${invalidChars.join(', ')}`
      });
    }
  }

  const patientId = req.patient.id;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const locsRes = await client.query(
      `SELECT code, label, position, is_red_flag, red_flag_reason
       FROM pain_locations
       WHERE code = ANY($1) AND is_active = TRUE`,
      [location_codes]
    );
    const locsFound = locsRes.rows;
    const found = new Set(locsFound.map(l => l.code));
    const missing = location_codes.filter(c => !found.has(c));
    if (missing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'ValidationError',
        message: `Неизвестные/неактивные локации: ${missing.join(', ')}`
      });
    }

    const redFlagLocs = locsFound.filter(l => l.is_red_flag);
    const newRedFlag = redFlagLocs.length > 0;

    const insRes = await client.query(
      `INSERT INTO pain_entries
         (patient_id, program_id, entry_date, is_event,
          vas_score, notes, trigger_type, pain_character, photo_url, red_flag_triggered)
       VALUES ($1, $2, CURRENT_DATE, TRUE, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        patientId,
        program_id ?? null,
        vas_score,
        notes ?? null,
        trigger_type ?? null,
        pain_character ?? null,
        photo_url ?? null,
        newRedFlag
      ]
    );
    const painEntry = insRes.rows[0];

    for (const loc of locsFound) {
      await client.query(
        `INSERT INTO pain_entry_locations (pain_entry_id, location_code) VALUES ($1, $2)`,
        [painEntry.id, loc.code]
      );
    }

    await client.query('COMMIT');

    let opsAlertId = null;
    if (newRedFlag) {
      const patRes = await query(
        `SELECT id, full_name, phone, email FROM patients WHERE id = $1`,
        [patientId]
      );
      opsAlertId = await triggerRedFlagAlert({
        patient: patRes.rows[0],
        pain_entry: painEntry,
        red_flag_locs: redFlagLocs,
        is_event: true
      });

      if (opsAlertId) {
        await query(
          `UPDATE pain_entries SET ops_alert_sent_at = NOW() WHERE id = $1`,
          [painEntry.id]
        );
      }
    }

    return res.status(201).json({
      data: {
        ...painEntry,
        locations: locsFound.map(l => ({
          code: l.code, label: l.label, is_red_flag: l.is_red_flag
        })),
        ops_alert_id: opsAlertId
      },
      message: newRedFlag
        ? 'Запись о боли сохранена. Куратор получит уведомление о красном флаге.'
        : 'Запись о боли сохранена'
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /rehab/my/pain/event error:', err.message);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось сохранить запись' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/rehab/my/pain
 * История pain_entries. Query: type=daily|event|all (default all), limit, offset, patient_id (instructor).
 * Пациент видит свою историю; инструктор должен передать ?patient_id.
 */
router.get('/my/pain', authenticatePatientOrInstructor, async (req, res) => {
  try {
    let patientId;
    if (req.patient) {
      patientId = req.patient.id;
    } else {
      patientId = parseInt(req.query.patient_id, 10);
      if (isNaN(patientId)) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'patient_id обязателен для инструктора'
        });
      }
    }

    const type = req.query.type || 'all';
    if (!['all', 'daily', 'event'].includes(type)) {
      return res.status(400).json({ error: 'ValidationError', message: 'type: all|daily|event' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    let typeFilter = '';
    if (type === 'daily') typeFilter = 'AND pe.is_event = FALSE';
    if (type === 'event') typeFilter = 'AND pe.is_event = TRUE';

    // HF#10 Fix A — pe.entry_date::text возвращает 'YYYY-MM-DD' без timezone shift.
    // Иначе pg-node парсит DATE в JS Date (UTC midnight) → JSON.stringify → ISO с
    // UTC offset → в RU (+05) дата сдвигается на -1 день, DailyPainSection не
    // pre-load'ит pain_entry за «сегодня». См. CLAUDE.md «PostgreSQL DATE → JSON timezone».
    const { rows } = await query(
      `SELECT
         pe.id, pe.patient_id, pe.program_id, pe.entry_date::text AS entry_date, pe.is_event,
         pe.vas_score, pe.notes, pe.trigger_type, pe.pain_character, pe.photo_url,
         pe.red_flag_triggered, pe.ops_alert_sent_at,
         pe.created_at, pe.updated_at,
         COALESCE(
           json_agg(
             json_build_object('code', pl.code, 'label', pl.label, 'is_red_flag', pl.is_red_flag)
             ORDER BY pl.position
           ) FILTER (WHERE pl.code IS NOT NULL),
           '[]'::json
         ) AS locations
       FROM pain_entries pe
       LEFT JOIN pain_entry_locations pel ON pel.pain_entry_id = pe.id
       LEFT JOIN pain_locations pl ON pl.code = pel.location_code
       WHERE pe.patient_id = $1 ${typeFilter}
       GROUP BY pe.id
       ORDER BY pe.created_at DESC
       LIMIT $2 OFFSET $3`,
      [patientId, limit, offset]
    );

    let totalFilter = '';
    if (type === 'daily') totalFilter = 'AND is_event = FALSE';
    if (type === 'event') totalFilter = 'AND is_event = TRUE';

    const totalRes = await query(
      `SELECT COUNT(*)::int AS cnt FROM pain_entries
       WHERE patient_id = $1 ${totalFilter}`,
      [patientId]
    );

    return res.json({ data: rows, total: totalRes.rows[0].cnt });
  } catch (err) {
    console.error('GET /rehab/my/pain error:', err.message);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить историю' });
  }
});

/**
 * GET /api/rehab/my/ops-alerts/recent
 * Wave 2 коммит 2.05 — для frontend dedup UX detection.
 * Возвращает recent red-flag alerts пациента за последние N часов (default 1, clamp 1..24).
 * Frontend использует это перед открытием PainEventForm — если есть recent alert,
 * показывает banner «Куратор уже уведомлён».
 */
router.get('/my/ops-alerts/recent', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    let hours = parseInt(req.query.hours, 10);
    if (isNaN(hours) || hours < 1) hours = 1;
    if (hours > 24) hours = 24;

    const { rows } = await query(
      `SELECT id, alert_type, severity, source_entity_id,
              telegram_attempted_at, created_at
       FROM ops_alerts
       WHERE patient_id = $1
         AND alert_type = 'red_flag_pain'
         AND created_at > NOW() - ($2 || ' hours')::INTERVAL
       ORDER BY created_at DESC`,
      [patientId, hours]
    );
    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('GET /rehab/my/ops-alerts/recent error:', err.message);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить' });
  }
});

module.exports = router;
