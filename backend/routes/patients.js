const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { patientValidator } = require('../middleware/validators');
const { logAudit } = require('../utils/audit');
const { hashToken } = require('../utils/tokens');
const { generateInviteCode } = require('../utils/inviteCode');
const { normalizePhone } = require('../utils/phone');

// Invite-код живёт 24 часа. Если инструктор не успел передать код пациенту —
// генерирует новый, старый автоматически инвалидируется (см. POST /:id/invite-code).
const INVITE_CODE_TTL_MS = 24 * 60 * 60 * 1000;

// Получить всех своих пациентов
router.get('/', authenticateToken, async (req, res) => {
  try {
    // is_stuck_on_phase — Wave 1 #1.09: TRUE если есть unresolved yellow/red
    // alert на активной программе пациента. Cron checkStuckPhases() заполняет
    // phase_stuck_alerts раз в неделю; alert живёт до resolved_at (NULL пока
    // инструктор не пометит resolved, UI для resolve — backlog).
    const result = await query(
      `SELECT p.id, p.full_name, p.email, p.phone, p.birth_date,
              p.diagnosis, p.doctor_diagnosis, p.notes, p.zone_link_note, p.is_active, p.avatar_url,
              p.last_login_at, p.telegram_chat_id,
              p.created_at, p.updated_at,
              (p.password_hash IS NOT NULL OR p.last_login_at IS NOT NULL) as is_registered,
              COUNT(DISTINCT c.id) as complexes_count,
              EXISTS (
                SELECT 1 FROM phase_stuck_alerts psa
                JOIN rehab_programs rp ON rp.id = psa.program_id
                WHERE rp.patient_id = p.id
                  AND rp.is_active = true AND rp.status = 'active'
                  AND psa.resolved_at IS NULL
              ) as is_stuck_on_phase
       FROM patients p
       LEFT JOIN complexes c ON p.id = c.patient_id AND c.is_active = true
       WHERE p.created_by = $1 AND p.is_active = true
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    res.json({
      data: result.rows,
      total: result.rows.length
    });

    // GDPR: лог массового чтения ПДн пациентов
    logAudit(req, 'READ', 'patients_list', null, {
      details: { count: result.rows.length },
    });

  } catch (error) {
    console.error('Ошибка получения пациентов:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при получении списка пациентов'
    });
  }
});

// Получить удалённых пациентов (корзина) - ВАЖНО: ПЕРЕД /:id
router.get('/trash', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.full_name, p.email, p.phone, p.birth_date,
              p.diagnosis, p.doctor_diagnosis, p.notes, p.zone_link_note, p.is_active, p.avatar_url,
              p.last_login_at, p.telegram_chat_id,
              p.created_at, p.updated_at,
              (p.password_hash IS NOT NULL OR p.last_login_at IS NOT NULL) as is_registered,
              COUNT(DISTINCT c.id) as complexes_count
       FROM patients p
       LEFT JOIN complexes c ON p.id = c.patient_id
       WHERE p.created_by = $1 AND p.is_active = false
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
      [req.user.id]
    );

    res.json({
      data: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Ошибка получения удалённых пациентов:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении списка удалённых пациентов' 
    });
  }
});

// Получить пациентов с прогрессом
router.get('/with-progress', authenticateToken, async (req, res) => {
  try {
    const instructorId = req.user.id;

    const result = await query(
      `SELECT 
         p.id,
         p.full_name,
         p.email,
         p.phone,
         p.created_at,
         COUNT(DISTINCT c.id) as total_complexes,
         COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = true) as active_complexes,
         COUNT(DISTINCT pl.session_id) FILTER (WHERE pl.session_id IS NOT NULL) as total_sessions,
         COUNT(DISTINCT DATE(pl.completed_at)) as training_days,
         AVG(pl.pain_level) FILTER (WHERE pl.pain_level IS NOT NULL) as avg_pain,
         AVG(pl.difficulty_rating) FILTER (WHERE pl.difficulty_rating IS NOT NULL) as avg_difficulty,
         MAX(pl.completed_at) as last_activity,
         COUNT(pl.id) FILTER (WHERE pl.completed_at > NOW() - INTERVAL '7 days') as sessions_last_week
       FROM patients p
       LEFT JOIN complexes c ON p.id = c.patient_id
       LEFT JOIN progress_logs pl ON c.id = pl.complex_id
       WHERE p.created_by = $1
       GROUP BY p.id
       ORDER BY last_activity DESC NULLS LAST, p.created_at DESC`,
      [instructorId]
    );

    const patients = result.rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      created_at: row.created_at,
      total_complexes: parseInt(row.total_complexes, 10) || 0,
      active_complexes: parseInt(row.active_complexes, 10) || 0,
      total_sessions: parseInt(row.total_sessions, 10) || 0,
      training_days: parseInt(row.training_days, 10) || 0,
      avg_pain: row.avg_pain !== null ? parseFloat(row.avg_pain) : null,
      avg_difficulty: row.avg_difficulty !== null ? parseFloat(row.avg_difficulty) : null,
      last_activity: row.last_activity,
      sessions_last_week: parseInt(row.sessions_last_week, 10) || 0,
      has_progress: parseInt(row.total_sessions, 10) > 0
    }));

    res.json({ data: patients });
  } catch (error) {
    console.error('Ошибка получения пациентов с прогрессом:', error);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка при получении пациентов с прогрессом' });
  }
});

// Получить одного пациента
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Получаем пациента (без password_hash)
    const patientResult = await query(
      `SELECT id, full_name, email, phone, birth_date, diagnosis, doctor_diagnosis, notes, zone_link_note,
              is_active, avatar_url, last_login_at, telegram_chat_id,
              created_at, updated_at,
              (password_hash IS NOT NULL OR last_login_at IS NOT NULL) as is_registered
       FROM patients
       WHERE id = $1 AND created_by = $2 AND is_active = true`,
      [id, req.user.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Пациент не найден' 
      });
    }

    const patient = patientResult.rows[0];

    // Получаем комплексы пациента
    const complexesResult = await query(
      `SELECT c.*, d.name as diagnosis_name,
              COUNT(ce.id) as exercises_count
       FROM complexes c
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN complex_exercises ce ON c.id = ce.complex_id
       WHERE c.patient_id = $1 AND c.is_active = true
       GROUP BY c.id, d.name
       ORDER BY c.created_at DESC`,
      [id]
    );

    res.json({
      data: { patient, complexes: complexesResult.rows }
    });

    // GDPR: лог чтения карточки конкретного пациента
    logAudit(req, 'READ', 'patient', patient.id, {
      patientId: patient.id,
      details: { complexes_count: complexesResult.rows.length },
    });

  } catch (error) {
    console.error('Ошибка получения пациента:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении данных пациента' 
    });
  }
});

// Создать нового пациента
router.post('/', authenticateToken, patientValidator, async (req, res) => {
  try {
    // ИЗМЕНЕНО: diagnosis + doctor_diagnosis (диагноз от внешнего врача) + zone_link_note (M2.1 связь зон)
    const { full_name, email, phone, birth_date, diagnosis, doctor_diagnosis, notes, zone_link_note } = req.body;

    // Валидация
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Имя пациента обязательно'
      });
    }

    // Преобразуем пустые строки в null для необязательных полей
    const emailValue = email && email.trim() ? email.trim() : null;
    const birthDateValue = birth_date && birth_date.trim() ? birth_date.trim() : null;
    const diagnosisValue = diagnosis && diagnosis.trim() ? diagnosis.trim() : null;
    const doctorDiagnosisValue = doctor_diagnosis && doctor_diagnosis.trim() ? doctor_diagnosis.trim() : null;
    const notesValue = notes && notes.trim() ? notes.trim() : null;
    const zoneLinkNoteValue = zone_link_note && zone_link_note.trim() ? zone_link_note.trim() : null;

    // Phone нормализуем в E.164 (для phone-match при OAuth)
    let phoneValue = null;
    if (phone && phone.trim()) {
      phoneValue = normalizePhone(phone);
      if (!phoneValue) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Некорректный формат телефона',
        });
      }
    }

    const result = await query(
      `INSERT INTO patients (full_name, email, phone, birth_date, diagnosis, doctor_diagnosis, notes, zone_link_note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, full_name, email, phone, birth_date, diagnosis, doctor_diagnosis, notes, zone_link_note,
                 is_active, avatar_url, last_login_at, telegram_chat_id,
                 created_at, updated_at,
                 (password_hash IS NOT NULL OR last_login_at IS NOT NULL) as is_registered`,
      [full_name.trim(), emailValue, phoneValue, birthDateValue, diagnosisValue, doctorDiagnosisValue, notesValue, zoneLinkNoteValue, req.user.id]
    );

    res.status(201).json({
      data: result.rows[0],
      message: 'Пациент успешно создан'
    });

  } catch (error) {
    console.error('Ошибка создания пациента:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при создании пациента' 
    });
  }
});

// Обновить данные пациента
router.put('/:id', authenticateToken, patientValidator, async (req, res) => {
  try {
    const { id } = req.params;
    // ИЗМЕНЕНО: diagnosis + doctor_diagnosis (диагноз от внешнего врача) + zone_link_note (M2.1 связь зон)
    const { full_name, email, phone, birth_date, diagnosis, doctor_diagnosis, notes, zone_link_note } = req.body;

    // Преобразуем пустые строки в null
    const fullNameValue = full_name && full_name.trim() ? full_name.trim() : null;
    const emailValue = email && email.trim() ? email.trim() : null;
    const birthDateValue = birth_date && birth_date.trim() ? birth_date.trim() : null;
    const diagnosisValue = diagnosis && diagnosis.trim() ? diagnosis.trim() : null;
    const doctorDiagnosisValue = doctor_diagnosis && doctor_diagnosis.trim() ? doctor_diagnosis.trim() : null;
    const notesValue = notes && notes.trim() ? notes.trim() : null;
    const zoneLinkNoteValue = zone_link_note && zone_link_note.trim() ? zone_link_note.trim() : null;

    // Phone нормализуем в E.164
    let phoneValue = null;
    if (phone && phone.trim()) {
      phoneValue = normalizePhone(phone);
      if (!phoneValue) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Некорректный формат телефона',
        });
      }
    }

    // ИЗМЕНЕНО: добавлен diagnosis в UPDATE
    const result = await query(
      `UPDATE patients
       SET full_name = COALESCE($1, full_name),
           email = $2,
           phone = $3,
           birth_date = $4,
           diagnosis = $5,
           doctor_diagnosis = $6,
           notes = $7,
           zone_link_note = $8,
           updated_at = NOW()
       WHERE id = $9 AND created_by = $10 AND is_active = true
       RETURNING id, full_name, email, phone, birth_date, diagnosis, doctor_diagnosis, notes, zone_link_note,
                 is_active, avatar_url, last_login_at, telegram_chat_id,
                 created_at, updated_at,
                 (password_hash IS NOT NULL OR last_login_at IS NOT NULL) as is_registered`,
      [fullNameValue, emailValue, phoneValue, birthDateValue, diagnosisValue, doctorDiagnosisValue, notesValue, zoneLinkNoteValue, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Пациент не найден' 
      });
    }

    res.json({
      data: result.rows[0],
      message: 'Данные пациента успешно обновлены'
    });

  } catch (error) {
    console.error('Ошибка обновления пациента:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при обновлении данных пациента' 
    });
  }
});

// Восстановить пациента
router.patch('/:id/restore', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE patients 
       SET is_active = true, updated_at = NOW() 
       WHERE id = $1 AND created_by = $2 
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Пациент не найден' 
      });
    }

    res.json({
      data: { id: result.rows[0].id },
      message: 'Пациент успешно восстановлен'
    });

  } catch (error) {
    console.error('Ошибка восстановления пациента:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при восстановлении пациента' 
    });
  }
});

// Удалить пациента (мягкое удаление)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE patients 
       SET is_active = false, updated_at = NOW() 
       WHERE id = $1 AND created_by = $2 
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Пациент не найден' 
      });
    }

    res.json({
      data: { id: result.rows[0].id },
      message: 'Пациент успешно удален'
    });

  } catch (error) {
    console.error('Ошибка удаления пациента:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при удалении пациента' 
    });
  }
});

// Полное удаление пациента из БД
router.delete('/:id/permanent', authenticateToken, async (req, res) => {
  const client = await getClient();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Проверяем ownership до любых удалений
    const patientCheck = await client.query(
      'SELECT id FROM patients WHERE id = $1 AND created_by = $2',
      [id, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден'
      });
    }

    // Удаляем все связанные данные в правильном порядке
    // 1. Данные комплексов
    await client.query('DELETE FROM progress_logs WHERE complex_id IN (SELECT id FROM complexes WHERE patient_id = $1)', [id]);
    await client.query('DELETE FROM complex_exercises WHERE complex_id IN (SELECT id FROM complexes WHERE patient_id = $1)', [id]);
    await client.query('DELETE FROM complexes WHERE patient_id = $1', [id]);

    // 2. Данные реабилитации
    await client.query('DELETE FROM messages WHERE program_id IN (SELECT id FROM rehab_programs WHERE patient_id = $1)', [id]);
    await client.query('DELETE FROM rehab_programs WHERE patient_id = $1', [id]);

    // 3. Дневник и стрики
    await client.query('DELETE FROM diary_entries WHERE patient_id = $1', [id]);
    await client.query('DELETE FROM streaks WHERE patient_id = $1', [id]);

    // 4. Авторизация и уведомления
    await client.query('DELETE FROM patient_refresh_tokens WHERE patient_id = $1', [id]);
    await client.query('DELETE FROM patient_password_resets WHERE patient_id = $1', [id]);
    await client.query('DELETE FROM patient_invite_codes WHERE patient_id = $1', [id]);
    await client.query('DELETE FROM notification_settings WHERE patient_id = $1', [id]);
    await client.query('DELETE FROM telegram_link_codes WHERE patient_id = $1', [id]);

    // 5. Удаляем самого пациента
    await client.query('DELETE FROM patients WHERE id = $1', [id]);

    await client.query('COMMIT');

    res.json({
      data: { id: parseInt(id) },
      message: 'Пациент удалён навсегда'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ошибка полного удаления пациента:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при удалении пациента'
    });
  } finally {
    client.release();
  }
});

// =====================================================
// POST /:id/invite-code — генерация invite-кода для пациента
// (инструктор отдаёт код пациенту любым способом — Telegram/SMS/устно)
// =====================================================
router.post('/:id/invite-code', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Ownership + статус регистрации
    const patientResult = await query(
      `SELECT id, full_name, password_hash, is_active
         FROM patients
        WHERE id = $1 AND created_by = $2`,
      [id, req.user.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден',
      });
    }

    const patient = patientResult.rows[0];

    if (patient.is_active === false) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Невозможно создать код — пациент в корзине',
      });
    }

    if (patient.password_hash) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Пациент уже зарегистрирован — код не нужен',
      });
    }

    // Один активный код на пациента: помечаем все предыдущие неиспользованные
    // как использованные (used_at = NOW()). Это сохраняет аудит-историю и
    // одновременно делает их невалидными.
    await query(
      `UPDATE patient_invite_codes
          SET used_at = NOW()
        WHERE patient_id = $1 AND used_at IS NULL`,
      [id]
    );

    // Генерим код, проверяем уникальность хэша (collision крайне маловероятен,
    // но на UNIQUE constraint нарвёмся при INSERT — пере-генерим до 5 раз).
    let plainCode = '';
    let codeHash = '';
    let inserted = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      plainCode = generateInviteCode();
      codeHash = hashToken(plainCode);
      const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_MS);

      try {
        const insertResult = await query(
          `INSERT INTO patient_invite_codes
             (patient_id, code_hash, expires_at, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, expires_at`,
          [id, codeHash, expiresAt, req.user.id]
        );
        inserted = insertResult.rows[0];
        break;
      } catch (err) {
        // 23505 — unique_violation. Любая другая ошибка — пробрасываем.
        if (err.code !== '23505') throw err;
      }
    }

    if (!inserted) {
      return res.status(500).json({
        error: 'Server Error',
        message: 'Не удалось сгенерировать уникальный код, повторите попытку',
      });
    }

    // GDPR/Audit
    logAudit(req, 'CREATE', 'patient_invite_code', inserted.id, {
      patientId: parseInt(id, 10),
    });

    res.status(201).json({
      data: {
        code: plainCode,
        expires_at: inserted.expires_at,
      },
      message: 'Код приглашения создан',
    });

  } catch (error) {
    console.error('Ошибка генерации invite-кода:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при создании кода приглашения',
    });
  }
});

// Wave 3 C1 — переназначение ответственного инструктора пациента
// PATCH /:id/assign-instructor  body: { instructor_id, reason? }
// Auth: admin-only (инструктор-инициированная передача — позже, в RBAC-блоке C5)
router.patch('/:id/assign-instructor', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const patientId = parseInt(req.params.id, 10);
    const { instructor_id, reason } = req.body;

    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Некорректный ID пациента',
      });
    }
    if (!Number.isInteger(instructor_id) || instructor_id <= 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'instructor_id обязателен и должен быть числом',
      });
    }

    // 1. Пациент существует и активен
    const patientResult = await query(
      'SELECT id, assigned_instructor_id FROM patients WHERE id = $1 AND is_active = true',
      [patientId]
    );
    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден',
      });
    }
    const fromUserId = patientResult.rows[0].assigned_instructor_id;

    // 2. Инструктор существует и активен (любая роль admin|instructor)
    const userResult = await query(
      'SELECT id FROM users WHERE id = $1 AND is_active = true',
      [instructor_id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Инструктор не найден или деактивирован',
      });
    }

    // 3. UPDATE
    const updateResult = await query(
      `UPDATE patients
          SET assigned_instructor_id = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, assigned_instructor_id`,
      [instructor_id, patientId]
    );

    // 4. Audit (Rule #17). Сигнатура logAudit(req, action, entityType, entityId, options),
    // options = { patientId?, details? } — payload идёт в details, не плоско.
    logAudit(req, 'PATIENT_REASSIGNED', 'patient', patientId, {
      patientId,
      details: {
        from_user_id: fromUserId,
        to_user_id: instructor_id,
        reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
      },
    });

    res.json({
      data: updateResult.rows[0],
      message: 'Инструктор назначен',
    });
  } catch (error) {
    console.error('Ошибка переназначения инструктора:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при переназначении инструктора',
    });
  }
});

module.exports = router;
