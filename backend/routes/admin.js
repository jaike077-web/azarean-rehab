const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../database/db');
const { testConnection } = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const config = require('../config/config');

// Все эндпоинты требуют admin-доступ
router.use(authenticateToken, requireAdmin);

// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================

// Логирование действий в audit_logs
async function logAudit(req, action, entityType, entityId, details = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, action, entityType, entityId, req.ip, req.headers['user-agent'], JSON.stringify(details)]
    );
  } catch (error) {
    console.error('Ошибка записи аудита:', error.message);
  }
}

// Валидация email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Валидация пароля (минимум 8 символов, заглавная, строчная, цифра)
const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) errors.push('минимум 8 символов');
  if (!/[A-Z]/.test(password)) errors.push('заглавная буква');
  if (!/[a-z]/.test(password)) errors.push('строчная буква');
  if (!/[0-9]/.test(password)) errors.push('цифра');
  return errors;
};

// Безопасный парсинг JSON (из rehab.js)
function safeJsonParse(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return typeof value === 'string' ? [value] : [];
  }
}

// =====================================================
// УПРАВЛЕНИЕ ЮЗЕРАМИ
// =====================================================

// GET /api/admin/users — список всех юзеров (с пагинацией)
router.get('/users', async (req, res) => {
  try {
    const { role, is_active, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [];
    const params = [];

    if (role) {
      params.push(role);
      whereClauses.push(`role = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      whereClauses.push(`is_active = $${params.length}`);
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Total count
    const countResult = await query(`SELECT COUNT(*) as total FROM users ${whereSQL}`, params);
    const total = parseInt(countResult.rows[0].total);

    // Data
    const dataParams = [...params, limitNum, offset];
    const sql = `SELECT id, email, full_name, role, is_active, created_at, updated_at,
                        failed_login_attempts, locked_until
                 FROM users ${whereSQL}
                 ORDER BY created_at DESC
                 LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

    const result = await query(sql, dataParams);
    res.json({ data: result.rows, total, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('Admin get users error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения пользователей' });
  }
});

// POST /api/admin/users — создать юзера
router.post('/users', async (req, res) => {
  try {
    const { email, password, full_name, role = 'instructor' } = req.body;

    // Валидация
    if (!email || !password || !full_name) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email, пароль и ФИО обязательны'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Некорректный формат email'
      });
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Пароль должен содержать: ${passwordErrors.join(', ')}`
      });
    }

    if (!['instructor', 'admin'].includes(role)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Недопустимая роль'
      });
    }

    // Проверка дубликата
    const existing = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Пользователь с таким email уже существует'
      });
    }

    // Создание
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES (LOWER($1), $2, $3, $4)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [email, password_hash, full_name, role]
    );

    await logAudit(req, 'CREATE', 'user', result.rows[0].id, { email, role });
    res.status(201).json({ data: result.rows[0], message: 'Пользователь создан' });
  } catch (error) {
    console.error('Admin create user error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка создания пользователя' });
  }
});

// PUT /api/admin/users/:id — обновить юзера
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, role, is_active, email, new_password } = req.body;

    // Нельзя деактивировать себя
    if (parseInt(id) === req.user.id && is_active === false) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Нельзя деактивировать свой аккаунт'
      });
    }

    if (role && !['instructor', 'admin'].includes(role)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Недопустимая роль'
      });
    }

    // Опциональный email change: validate + unique check (исключая self).
    // Пустая строка / undefined / null → не трогаем email.
    let normalizedEmail = null;
    if (email && typeof email === 'string' && email.trim() !== '') {
      if (!isValidEmail(email)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Некорректный формат email'
        });
      }
      normalizedEmail = email.toLowerCase().trim();
      const dupe = await query(
        'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2',
        [normalizedEmail, id]
      );
      if (dupe.rows.length > 0) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Email уже занят другим пользователем'
        });
      }
    }

    // Опциональный password change: validate + bcrypt hash.
    // После UPDATE — инвалидируем все refresh_tokens этого юзера (force re-login).
    let password_hash = null;
    if (new_password && typeof new_password === 'string' && new_password.length > 0) {
      const passwordErrors = validatePassword(new_password);
      if (passwordErrors.length > 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Пароль должен содержать: ${passwordErrors.join(', ')}`
        });
      }
      const salt = await bcrypt.genSalt(12);
      password_hash = await bcrypt.hash(new_password, salt);
    }

    const result = await query(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        role = COALESCE($2, role),
        is_active = COALESCE($3, is_active),
        email = COALESCE($4, email),
        password_hash = COALESCE($5, password_hash),
        updated_at = NOW()
       WHERE id = $6
       RETURNING id, email, full_name, role, is_active, created_at, updated_at`,
      [
        full_name || null,
        role || null,
        is_active !== undefined ? is_active : null,
        normalizedEmail,
        password_hash,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Пользователь не найден' });
    }

    // Force re-login после password change — все active refresh_tokens этого юзера удаляются.
    if (password_hash) {
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
    }

    // Audit: фиксируем что менялось без записи самого пароля.
    const auditDetails = { full_name, role, is_active };
    if (normalizedEmail) auditDetails.email_changed_to = normalizedEmail;
    if (password_hash) auditDetails.password_changed = true;
    await logAudit(req, 'UPDATE', 'user', parseInt(id), auditDetails);

    res.json({ data: result.rows[0], message: 'Пользователь обновлён' });
  } catch (error) {
    console.error('Admin update user error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка обновления пользователя' });
  }
});

// PATCH /api/admin/users/:id/deactivate
router.patch('/users/:id/deactivate', async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Нельзя деактивировать свой аккаунт'
      });
    }

    const result = await query(
      `UPDATE users SET is_active = false, updated_at = NOW()
       WHERE id = $1 RETURNING id, email, full_name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Пользователь не найден' });
    }

    // Удалить refresh_tokens
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);

    // Деактивировать комплексы инструктора
    await query('UPDATE complexes SET is_active = false, updated_at = NOW() WHERE instructor_id = $1 AND is_active = true', [id]);

    await logAudit(req, 'DEACTIVATE', 'user', parseInt(id), { email: result.rows[0].email });
    res.json({ data: result.rows[0], message: 'Пользователь деактивирован' });
  } catch (error) {
    console.error('Admin deactivate user error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка деактивации' });
  }
});

// PATCH /api/admin/users/:id/activate
router.patch('/users/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE users SET is_active = true, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id, email, full_name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Пользователь не найден' });
    }

    await logAudit(req, 'ACTIVATE', 'user', parseInt(id), { email: result.rows[0].email });
    res.json({ data: result.rows[0], message: 'Пользователь активирован' });
  } catch (error) {
    console.error('Admin activate user error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка активации' });
  }
});

// PATCH /api/admin/users/:id/unlock
router.patch('/users/:id/unlock', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id, email, full_name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Пользователь не найден' });
    }

    await logAudit(req, 'UNLOCK', 'user', parseInt(id), { email: result.rows[0].email });
    res.json({ data: result.rows[0], message: 'Аккаунт разблокирован' });
  } catch (error) {
    console.error('Admin unlock user error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка разблокировки' });
  }
});

// =====================================================
// СТАТИСТИКА
// =====================================================

// GET /api/admin/stats — глобальная статистика
router.get('/stats', async (req, res) => {
  try {
    const [
      usersCount,
      patientsCount,
      programsCount,
      complexesCount,
      exercisesCount,
      diaryCount,
      messagesCount,
      tipsCount,
      phasesCount,
      videosCount,
      auditCount,
      registrationsMonth,
      activeStreaks
    ] = await Promise.all([
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE role = \'admin\') as admins, COUNT(*) FILTER (WHERE role = \'instructor\') as instructors, COUNT(*) FILTER (WHERE is_active = true) as active FROM users'),
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM patients'),
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'active\') as active FROM rehab_programs'),
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM complexes'),
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM exercises'),
      query('SELECT COUNT(*) as total FROM diary_entries'),
      query('SELECT COUNT(*) as total FROM messages'),
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM tips'),
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM rehab_phases'),
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM phase_videos'),
      query('SELECT COUNT(*) as total FROM audit_logs'),
      query(`SELECT COUNT(*) as total FROM users WHERE created_at >= date_trunc('month', CURRENT_DATE)`),
      query('SELECT COUNT(*) as total FROM streaks WHERE current_streak > 0')
    ]);

    res.json({
      data: {
        users: usersCount.rows[0],
        patients: patientsCount.rows[0],
        programs: programsCount.rows[0],
        complexes: complexesCount.rows[0],
        exercises: exercisesCount.rows[0],
        diary_entries: { total: diaryCount.rows[0].total },
        messages: { total: messagesCount.rows[0].total },
        tips: tipsCount.rows[0],
        phases: phasesCount.rows[0],
        videos: videosCount.rows[0],
        audit_logs: { total: auditCount.rows[0].total },
        registrations_this_month: registrationsMonth.rows[0].total,
        active_streaks: activeStreaks.rows[0].total
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения статистики' });
  }
});

// =====================================================
// АУДИТ-ЛОГИ
// =====================================================

// GET /api/admin/audit-logs — журнал с фильтрами и пагинацией
router.get('/audit-logs', async (req, res) => {
  try {
    const { user_id, action, entity_type, from, to, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [];
    const params = [];

    if (user_id) {
      params.push(parseInt(user_id));
      whereClauses.push(`al.user_id = $${params.length}`);
    }
    if (action) {
      params.push(action);
      whereClauses.push(`al.action = $${params.length}`);
    }
    if (entity_type) {
      params.push(entity_type);
      whereClauses.push(`al.entity_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      whereClauses.push(`al.created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      whereClauses.push(`al.created_at < ($${params.length}::date + interval '1 day')`);
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Общий count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM audit_logs al ${whereSQL}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Данные с пагинацией
    const dataParams = [...params, limitNum, offset];
    const result = await query(
      `SELECT al.id, al.user_id, al.action, al.entity_type, al.entity_id,
              al.patient_id, al.ip_address, al.user_agent, al.details, al.created_at,
              u.full_name as user_name, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${whereSQL}
       ORDER BY al.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({
      data: result.rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    console.error('Admin audit logs error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения аудит-логов' });
  }
});

// =====================================================
// КОНТЕНТ: ФАЗЫ РЕАБИЛИТАЦИИ
// =====================================================

// GET /api/admin/phases — все фазы (включая неактивные)
router.get('/phases', async (req, res) => {
  try {
    const { program_type } = req.query;
    let sql = `SELECT * FROM rehab_phases`;
    const params = [];

    if (program_type) {
      params.push(program_type);
      sql += ` WHERE program_type = $${params.length}`;
    }

    sql += ' ORDER BY program_type, phase_number';
    const result = await query(sql, params);

    const phases = result.rows.map(row => ({
      ...row,
      goals: safeJsonParse(row.goals),
      restrictions: safeJsonParse(row.restrictions),
      criteria_next: safeJsonParse(row.criteria_next),
      allowed: safeJsonParse(row.allowed),
      pain: safeJsonParse(row.pain),
      daily: safeJsonParse(row.daily),
      red_flags: safeJsonParse(row.red_flags),
      faq: safeJsonParse(row.faq)
    }));

    res.json({ data: phases });
  } catch (error) {
    console.error('Admin get phases error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения фаз' });
  }
});

// GET /api/admin/phases/:id — фаза с видео
router.get('/phases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM rehab_phases WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Фаза не найдена' });
    }

    const phase = result.rows[0];
    const videos = await query(
      'SELECT * FROM phase_videos WHERE phase_id = $1 ORDER BY order_number',
      [id]
    );

    res.json({
      data: {
        ...phase,
        goals: safeJsonParse(phase.goals),
        restrictions: safeJsonParse(phase.restrictions),
        criteria_next: safeJsonParse(phase.criteria_next),
        allowed: safeJsonParse(phase.allowed),
        pain: safeJsonParse(phase.pain),
        daily: safeJsonParse(phase.daily),
        red_flags: safeJsonParse(phase.red_flags),
        faq: safeJsonParse(phase.faq),
        videos: videos.rows
      }
    });
  } catch (error) {
    console.error('Admin get phase error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения фазы' });
  }
});

// POST /api/admin/phases — создать фазу
router.post('/phases', async (req, res) => {
  try {
    const {
      program_type = 'acl', phase_number, title, subtitle, duration_weeks,
      description, goals, restrictions, criteria_next, icon, color, color_bg,
      teaser, allowed, pain, daily, red_flags, faq
    } = req.body;

    if (!title || !phase_number) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Название и номер фазы обязательны'
      });
    }

    // Wave 1 #1.05: program_type должен существовать в справочнике.
    // FK на rehab_phases.program_type → program_types.code отсутствует,
    // поэтому валидируем на уровне приложения.
    const ptCheck = await query('SELECT code FROM program_types WHERE code = $1', [program_type]);
    if (ptCheck.rows.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Тип программы "${program_type}" не найден в справочнике program_types`,
      });
    }

    const result = await query(
      `INSERT INTO rehab_phases (program_type, phase_number, title, subtitle, duration_weeks,
        description, goals, restrictions, criteria_next, icon, color, color_bg,
        teaser, allowed, pain, daily, red_flags, faq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        program_type, phase_number, title, subtitle || null, duration_weeks || null,
        description || null,
        goals ? JSON.stringify(goals) : null,
        restrictions ? JSON.stringify(restrictions) : null,
        criteria_next ? JSON.stringify(criteria_next) : null,
        icon || null, color || null, color_bg || null,
        teaser || null,
        allowed ? JSON.stringify(allowed) : null,
        pain ? JSON.stringify(pain) : null,
        daily ? JSON.stringify(daily) : null,
        red_flags ? JSON.stringify(red_flags) : null,
        faq ? JSON.stringify(faq) : null
      ]
    );

    await logAudit(req, 'CREATE', 'phase', result.rows[0].id, { title, program_type });
    res.status(201).json({ data: result.rows[0], message: 'Фаза создана' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Фаза с таким номером уже существует для данного типа программы'
      });
    }
    console.error('Admin create phase error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка создания фазы' });
  }
});

// PUT /api/admin/phases/:id — обновить фазу
router.put('/phases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      program_type, phase_number, title, subtitle, duration_weeks,
      description, goals, restrictions, criteria_next, icon, color, color_bg,
      teaser, allowed, pain, daily, red_flags, faq
    } = req.body;

    const result = await query(
      `UPDATE rehab_phases SET
        program_type = COALESCE($1, program_type),
        phase_number = COALESCE($2, phase_number),
        title = COALESCE($3, title),
        subtitle = COALESCE($4, subtitle),
        duration_weeks = COALESCE($5, duration_weeks),
        description = COALESCE($6, description),
        goals = COALESCE($7, goals),
        restrictions = COALESCE($8, restrictions),
        criteria_next = COALESCE($9, criteria_next),
        icon = COALESCE($10, icon),
        color = COALESCE($11, color),
        color_bg = COALESCE($12, color_bg),
        teaser = COALESCE($13, teaser),
        allowed = COALESCE($14, allowed),
        pain = COALESCE($15, pain),
        daily = COALESCE($16, daily),
        red_flags = COALESCE($17, red_flags),
        faq = COALESCE($18, faq)
       WHERE id = $19
       RETURNING *`,
      [
        program_type || null, phase_number || null, title || null,
        subtitle || null, duration_weeks || null, description || null,
        goals ? JSON.stringify(goals) : null,
        restrictions ? JSON.stringify(restrictions) : null,
        criteria_next ? JSON.stringify(criteria_next) : null,
        icon || null, color || null, color_bg || null, teaser || null,
        allowed ? JSON.stringify(allowed) : null,
        pain ? JSON.stringify(pain) : null,
        daily ? JSON.stringify(daily) : null,
        red_flags ? JSON.stringify(red_flags) : null,
        faq ? JSON.stringify(faq) : null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Фаза не найдена' });
    }

    await logAudit(req, 'UPDATE', 'phase', parseInt(id), { title });
    res.json({ data: result.rows[0], message: 'Фаза обновлена' });
  } catch (error) {
    console.error('Admin update phase error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка обновления фазы' });
  }
});

// DELETE /api/admin/phases/:id — soft delete
router.delete('/phases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE rehab_phases SET is_active = false WHERE id = $1 RETURNING id, title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Фаза не найдена' });
    }

    await logAudit(req, 'DELETE', 'phase', parseInt(id), { title: result.rows[0].title });
    res.json({ data: result.rows[0], message: 'Фаза деактивирована' });
  } catch (error) {
    console.error('Admin delete phase error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка удаления фазы' });
  }
});

// =====================================================
// КОНТЕНТ: ТИПЫ ПРОГРАММ (PROGRAM_TYPES) — Wave 1 #1.05
// =====================================================

// GET /api/admin/program-types — список всех (включая is_active=false)
router.get('/program-types', async (req, res) => {
  try {
    const result = await query(
      `SELECT code, label, joint, body_side_relevant, surgery_required,
              is_active, position, created_at, updated_at
       FROM program_types
       ORDER BY position ASC, code ASC`
    );
    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Admin get program_types error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения типов программ' });
  }
});

// POST /api/admin/program-types — создать новый тип
router.post('/program-types', async (req, res) => {
  try {
    const { code, label, joint, body_side_relevant, surgery_required, position } = req.body;

    if (!code || !label) {
      return res.status(400).json({ error: 'Validation Error', message: 'code и label обязательны' });
    }
    if (!/^[a-z0-9_]{1,50}$/.test(code)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'code должен быть lowercase a-z0-9_ длиной 1-50',
      });
    }

    const result = await query(
      `INSERT INTO program_types (code, label, joint, body_side_relevant, surgery_required, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        code,
        label,
        joint || null,
        body_side_relevant === undefined ? true : !!body_side_relevant,
        surgery_required === undefined ? false : !!surgery_required,
        position === undefined ? 0 : parseInt(position, 10) || 0,
      ]
    );

    await logAudit(req, 'CREATE', 'program_type', null, { code, label });
    res.status(201).json({ data: result.rows[0], message: 'Тип программы создан' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'Тип с таким кодом уже существует' });
    }
    console.error('Admin create program_type error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка создания типа программы' });
  }
});

// PUT /api/admin/program-types/:code — обновить (label/joint/flags/position/is_active)
// Сам code менять нельзя — на него ссылаются rehab_programs.program_type через FK
router.put('/program-types/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const fields = ['label', 'joint', 'body_side_relevant', 'surgery_required', 'position', 'is_active'];
    const updates = [];
    const params = [code];
    let p = 2;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${p++}`);
        params.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'Нет полей для обновления' });
    }
    updates.push('updated_at = NOW()');

    const result = await query(
      `UPDATE program_types SET ${updates.join(', ')} WHERE code = $1 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Тип программы не найден' });
    }

    await logAudit(req, 'UPDATE', 'program_type', null, { code, changes: req.body });
    res.json({ data: result.rows[0], message: 'Тип программы обновлён' });
  } catch (error) {
    console.error('Admin update program_type error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка обновления типа программы' });
  }
});

// DELETE /api/admin/program-types/:code — soft delete (is_active=false).
// Блокируется если есть активные программы с этим типом — пациентов надо
// сначала перевести на другой тип. Физически НЕ удаляем — на code могут
// ссылаться исторические rehab_programs (soft-deleted) и rehab_phases.
router.delete('/program-types/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const usage = await query(
      `SELECT COUNT(*)::int AS active_programs FROM rehab_programs
       WHERE program_type = $1 AND is_active = true AND status = 'active'`,
      [code]
    );
    if (usage.rows[0].active_programs > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Тип используется в ${usage.rows[0].active_programs} активных программах. Сначала переведите пациентов на другой тип.`,
      });
    }

    const result = await query(
      `UPDATE program_types SET is_active = false, updated_at = NOW()
       WHERE code = $1 RETURNING code, label`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Тип программы не найден' });
    }

    await logAudit(req, 'DEACTIVATE', 'program_type', null, { code });
    res.json({ data: { code: result.rows[0].code, deactivated: true }, message: 'Тип программы деактивирован' });
  } catch (error) {
    console.error('Admin delete program_type error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка деактивации типа программы' });
  }
});

// =====================================================
// КОНТЕНТ: ШАБЛОНЫ ПРОГРАММ (PROGRAM_TEMPLATES) — Wave 1 #1.07
// =====================================================

// GET /api/admin/program-templates — список всех шаблонов с usage-count
router.get('/program-templates', async (req, res) => {
  try {
    const result = await query(`
      SELECT pt.id, pt.code, pt.program_type, pt.title, pt.description,
             pt.surgery_required, pt.default_phase_count, pt.variant_of,
             pt.is_active, pt.position, pt.created_at, pt.updated_at,
             types.label AS program_type_label, types.joint AS program_joint,
             (SELECT COUNT(*)::int FROM rehab_programs
               WHERE program_template_id = pt.id AND is_active = true AND status = 'active') AS active_programs_count
      FROM program_templates pt
      LEFT JOIN program_types types ON types.code = pt.program_type
      ORDER BY pt.position ASC, pt.title ASC
    `);
    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Admin get program_templates error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения шаблонов программ' });
  }
});

// POST /api/admin/program-templates
router.post('/program-templates', async (req, res) => {
  try {
    const { code, program_type, title, description, surgery_required, default_phase_count, variant_of, position } = req.body;

    if (!code || !program_type || !title) {
      return res.status(400).json({ error: 'Validation Error', message: 'code, program_type и title обязательны' });
    }
    if (!/^[a-z0-9_]{1,50}$/.test(code)) {
      return res.status(400).json({ error: 'Validation Error', message: 'code должен быть lowercase a-z0-9_ длиной 1-50' });
    }

    // Валидация program_type существует и активен
    const ptCheck = await query(
      'SELECT code FROM program_types WHERE code = $1 AND is_active = true',
      [program_type]
    );
    if (ptCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'program_type не найден или деактивирован' });
    }

    const result = await query(
      `INSERT INTO program_templates (code, program_type, title, description, surgery_required, default_phase_count, variant_of, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        code,
        program_type,
        title,
        description || null,
        surgery_required === undefined ? false : !!surgery_required,
        default_phase_count || null,
        variant_of || null,
        position === undefined ? 0 : parseInt(position, 10) || 0,
      ]
    );

    await logAudit(req, 'CREATE', 'program_template', result.rows[0].id, { code, title, program_type });
    res.status(201).json({ data: result.rows[0], message: 'Шаблон программы создан' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'Шаблон с таким кодом уже существует' });
    }
    console.error('Admin create program_template error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка создания шаблона программы' });
  }
});

// PUT /api/admin/program-templates/:id
router.put('/program-templates/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Невалидный id' });
    }

    const fields = ['title', 'description', 'surgery_required', 'default_phase_count', 'variant_of', 'position', 'is_active', 'program_type'];
    const updates = [];
    const params = [id];
    let p = 2;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${p++}`);
        params.push(req.body[f]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'Нет полей для обновления' });
    }
    updates.push('updated_at = NOW()');

    const result = await query(
      `UPDATE program_templates SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Шаблон программы не найден' });
    }

    await logAudit(req, 'UPDATE', 'program_template', id, { changes: req.body });
    res.json({ data: result.rows[0], message: 'Шаблон программы обновлён' });
  } catch (error) {
    console.error('Admin update program_template error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка обновления шаблона программы' });
  }
});

// DELETE /api/admin/program-templates/:id — soft (is_active=false).
// Блокируется 409 если есть активные программы, привязанные к шаблону.
router.delete('/program-templates/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Невалидный id' });
    }

    const usage = await query(
      `SELECT COUNT(*)::int AS c FROM rehab_programs
       WHERE program_template_id = $1 AND is_active = true AND status = 'active'`,
      [id]
    );
    if (usage.rows[0].c > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Шаблон используется в ${usage.rows[0].c} активных программах. Сначала переведите пациентов на другой шаблон.`,
      });
    }

    const result = await query(
      `UPDATE program_templates SET is_active = false, updated_at = NOW()
       WHERE id = $1 RETURNING id, code`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Шаблон программы не найден' });
    }

    await logAudit(req, 'DEACTIVATE', 'program_template', id, { code: result.rows[0].code });
    res.json({ data: { id: result.rows[0].id, deactivated: true }, message: 'Шаблон программы деактивирован' });
  } catch (error) {
    console.error('Admin delete program_template error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка деактивации шаблона' });
  }
});

// GET /api/admin/program-templates/:id/phase-complexes
router.get('/program-templates/:id/phase-complexes', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Невалидный id' });
    }
    const result = await query(
      `SELECT pc.id, pc.phase_number, pc.complex_template_id, pc.is_recommended, pc.notes,
              t.name AS template_name, t.description AS template_description
       FROM program_template_phase_complexes pc
       LEFT JOIN templates t ON t.id = pc.complex_template_id
       WHERE pc.program_template_id = $1
       ORDER BY pc.phase_number`,
      [id]
    );
    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Admin get phase_complexes error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения phase-complexes' });
  }
});

// PUT /api/admin/program-templates/:id/phase-complexes/:phase — UPSERT
router.put('/program-templates/:id/phase-complexes/:phase', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const phaseNumber = parseInt(req.params.phase, 10);
    if (!Number.isFinite(id) || !Number.isFinite(phaseNumber)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Невалидные id или phase_number' });
    }
    const { complex_template_id, is_recommended, notes } = req.body;

    const result = await query(
      `INSERT INTO program_template_phase_complexes (program_template_id, phase_number, complex_template_id, is_recommended, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (program_template_id, phase_number)
       DO UPDATE SET
         complex_template_id = EXCLUDED.complex_template_id,
         is_recommended = EXCLUDED.is_recommended,
         notes = EXCLUDED.notes
       RETURNING *`,
      [
        id,
        phaseNumber,
        complex_template_id || null,
        is_recommended === undefined ? true : !!is_recommended,
        notes || null,
      ]
    );

    await logAudit(req, 'UPSERT', 'phase_complex', id, { phase_number: phaseNumber, complex_template_id });
    res.json({ data: result.rows[0], message: 'Phase-complex сохранён' });
  } catch (error) {
    console.error('Admin upsert phase_complex error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка сохранения phase-complex' });
  }
});

// DELETE /api/admin/program-templates/:id/phase-complexes/:phase
router.delete('/program-templates/:id/phase-complexes/:phase', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const phaseNumber = parseInt(req.params.phase, 10);
    if (!Number.isFinite(id) || !Number.isFinite(phaseNumber)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Невалидные id или phase_number' });
    }

    const result = await query(
      `DELETE FROM program_template_phase_complexes
       WHERE program_template_id = $1 AND phase_number = $2 RETURNING id`,
      [id, phaseNumber]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Phase-complex не найден' });
    }

    await logAudit(req, 'DELETE', 'phase_complex', id, { phase_number: phaseNumber });
    res.json({ data: { deleted: true }, message: 'Phase-complex удалён' });
  } catch (error) {
    console.error('Admin delete phase_complex error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка удаления phase-complex' });
  }
});

// =====================================================
// КОНТЕНТ: КРИТЕРИИ ПЕРЕХОДА ФАЗ (Wave 2 коммит 2.03)
// =====================================================

// GET /api/admin/phases/:phase_id/criteria — список критериев фазы (опц. filter is_active)
router.get('/phases/:phase_id/criteria', async (req, res) => {
  try {
    const phase_id = parseInt(req.params.phase_id, 10);
    if (!Number.isFinite(phase_id)) {
      return res.status(400).json({ error: 'Validation Error', message: 'phase_id должен быть числом' });
    }

    const { is_active } = req.query;
    let sql = `
      SELECT id, phase_id, criterion_code, label, criterion_type,
             measurement_type, measurement_source,
             threshold_operator, threshold_value, threshold_value2, staleness_days,
             self_report_question, self_report_hint,
             position, is_required, is_active, created_at, updated_at
      FROM phase_transition_criteria
      WHERE phase_id = $1
    `;
    const params = [phase_id];

    if (is_active !== undefined) {
      params.push(is_active === 'true' || is_active === true);
      sql += ` AND is_active = $${params.length}`;
    }

    sql += ` ORDER BY position, id`;
    const result = await query(sql, params);
    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Admin get phase-criteria error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения критериев' });
  }
});

// POST /api/admin/phases/:phase_id/criteria — создать критерий под фазой
router.post('/phases/:phase_id/criteria', async (req, res) => {
  const phase_id = parseInt(req.params.phase_id, 10);
  if (!Number.isFinite(phase_id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'phase_id должен быть числом' });
  }

  const {
    criterion_code, label, criterion_type,
    measurement_type, measurement_source,
    threshold_operator, threshold_value, threshold_value2, staleness_days,
    self_report_question, self_report_hint,
    position, is_required
  } = req.body;

  if (!criterion_code || typeof criterion_code !== 'string' || !/^[a-z0-9_]+$/.test(criterion_code) || criterion_code.length > 50) {
    return res.status(400).json({ error: 'Validation Error', message: 'criterion_code: lowercase + digits + underscore, до 50 символов' });
  }
  if (!label || typeof label !== 'string' || label.length === 0 || label.length > 255) {
    return res.status(400).json({ error: 'Validation Error', message: 'label обязателен (≤255 символов)' });
  }
  if (!['measurement', 'self_report', 'instructor_check'].includes(criterion_type)) {
    return res.status(400).json({ error: 'Validation Error', message: 'criterion_type: measurement|self_report|instructor_check' });
  }

  if (criterion_type === 'measurement') {
    if (!measurement_type || !measurement_source || !threshold_operator) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Для measurement критерия: measurement_type, measurement_source, threshold_operator обязательны'
      });
    }
    if (!['>=', '<=', '=', '>', '<', 'between'].includes(threshold_operator)) {
      return res.status(400).json({ error: 'Validation Error', message: 'threshold_operator: >=, <=, =, >, <, between' });
    }
    if (threshold_value === undefined || threshold_value === null) {
      return res.status(400).json({ error: 'Validation Error', message: 'threshold_value обязателен для measurement' });
    }
    if (threshold_operator === 'between' && (threshold_value2 === undefined || threshold_value2 === null)) {
      return res.status(400).json({ error: 'Validation Error', message: 'threshold_value2 обязателен для operator between' });
    }
    if (!['rom', 'girth', 'pain'].includes(measurement_source)) {
      return res.status(400).json({ error: 'Validation Error', message: 'measurement_source: rom|girth|pain' });
    }
  }

  if (criterion_type === 'self_report' && !self_report_question) {
    return res.status(400).json({ error: 'Validation Error', message: 'self_report_question обязателен для self_report' });
  }

  try {
    const phaseCheck = await query('SELECT id FROM rehab_phases WHERE id = $1', [phase_id]);
    if (phaseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Фаза не найдена' });
    }

    const result = await query(
      `INSERT INTO phase_transition_criteria (
         phase_id, criterion_code, label, criterion_type,
         measurement_type, measurement_source,
         threshold_operator, threshold_value, threshold_value2, staleness_days,
         self_report_question, self_report_hint,
         position, is_required, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)
       RETURNING *`,
      [
        phase_id, criterion_code, label, criterion_type,
        criterion_type === 'measurement' ? measurement_type : null,
        criterion_type === 'measurement' ? measurement_source : null,
        criterion_type === 'measurement' ? threshold_operator : null,
        criterion_type === 'measurement' ? threshold_value : null,
        criterion_type === 'measurement' && threshold_operator === 'between' ? threshold_value2 : null,
        staleness_days ?? 7,
        criterion_type === 'self_report' ? self_report_question : null,
        criterion_type === 'self_report' ? (self_report_hint || null) : null,
        position ?? 0,
        is_required ?? true
      ]
    );

    await logAudit(req, 'CREATE', 'phase_criterion', result.rows[0].id, { phase_id, criterion_code, criterion_type });

    res.status(201).json({ data: result.rows[0], message: 'Критерий создан' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'criterion_code уже существует в этой фазе' });
    }
    console.error('Admin create phase-criterion error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка создания критерия' });
  }
});

// PUT /api/admin/criteria/:id — обновить критерий. phase_id и criterion_code immutable.
router.put('/criteria/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'id должен быть числом' });
  }

  const {
    label, criterion_type,
    measurement_type, measurement_source,
    threshold_operator, threshold_value, threshold_value2, staleness_days,
    self_report_question, self_report_hint,
    position, is_required, is_active
  } = req.body;

  const sets = [];
  const params = [];
  let idx = 1;

  if (label !== undefined) {
    if (typeof label !== 'string' || !label.length || label.length > 255) {
      return res.status(400).json({ error: 'Validation Error', message: 'label длина 1..255' });
    }
    sets.push(`label = $${idx++}`); params.push(label);
  }
  if (criterion_type !== undefined) {
    if (!['measurement', 'self_report', 'instructor_check'].includes(criterion_type)) {
      return res.status(400).json({ error: 'Validation Error', message: 'criterion_type invalid' });
    }
    sets.push(`criterion_type = $${idx++}`); params.push(criterion_type);
  }
  if (measurement_type !== undefined) { sets.push(`measurement_type = $${idx++}`); params.push(measurement_type); }
  if (measurement_source !== undefined) { sets.push(`measurement_source = $${idx++}`); params.push(measurement_source); }
  if (threshold_operator !== undefined) {
    if (threshold_operator !== null && !['>=', '<=', '=', '>', '<', 'between'].includes(threshold_operator)) {
      return res.status(400).json({ error: 'Validation Error', message: 'threshold_operator invalid' });
    }
    sets.push(`threshold_operator = $${idx++}`); params.push(threshold_operator);
  }
  if (threshold_value !== undefined) { sets.push(`threshold_value = $${idx++}`); params.push(threshold_value); }
  if (threshold_value2 !== undefined) { sets.push(`threshold_value2 = $${idx++}`); params.push(threshold_value2); }
  if (staleness_days !== undefined) { sets.push(`staleness_days = $${idx++}`); params.push(staleness_days); }
  if (self_report_question !== undefined) { sets.push(`self_report_question = $${idx++}`); params.push(self_report_question); }
  if (self_report_hint !== undefined) { sets.push(`self_report_hint = $${idx++}`); params.push(self_report_hint); }
  if (position !== undefined) { sets.push(`position = $${idx++}`); params.push(position); }
  if (is_required !== undefined) { sets.push(`is_required = $${idx++}`); params.push(!!is_required); }
  if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(!!is_active); }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Нет полей для обновления' });
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  try {
    const result = await query(
      `UPDATE phase_transition_criteria SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Критерий не найден' });
    }

    await logAudit(req, 'UPDATE', 'phase_criterion', id, { changes: req.body });

    res.json({ data: result.rows[0], message: 'Критерий обновлён' });
  } catch (error) {
    console.error('Admin update criterion error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка обновления критерия' });
  }
});

// DELETE /api/admin/criteria/:id — hard delete только если нет ссылок из patient_criterion_answers
router.delete('/criteria/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'id должен быть числом' });
  }

  try {
    const refsCheck = await query(
      `SELECT COUNT(*)::int AS cnt FROM patient_criterion_answers WHERE criterion_id = $1`,
      [id]
    );
    const cnt = refsCheck.rows[0]?.cnt ?? 0;
    if (cnt > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Критерий использован в ${cnt} ответах пациентов. Деактивируйте (is_active=false) вместо удаления.`
      });
    }

    const result = await query('DELETE FROM phase_transition_criteria WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Критерий не найден' });
    }

    await logAudit(req, 'DELETE', 'phase_criterion', id, {});

    res.json({ data: { id }, message: 'Критерий удалён' });
  } catch (error) {
    console.error('Admin delete criterion error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка удаления критерия' });
  }
});

// =====================================================
// КОНТЕНТ: ЛОКАЦИИ БОЛИ (Wave 2 коммит 2.02)
// =====================================================

// GET /api/admin/pain-locations — список локаций (опц. filter program_type, is_active)
router.get('/pain-locations', async (req, res) => {
  try {
    const { program_type, is_active } = req.query;
    const conditions = [];
    const params = [];

    if (program_type) {
      params.push(program_type);
      conditions.push(`pl.program_type = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true' || is_active === true);
      conditions.push(`pl.is_active = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT pl.code, pl.program_type, pt.label AS program_type_label,
              pl.label, pl.position, pl.is_red_flag, pl.red_flag_reason,
              pl.is_active, pl.created_at, pl.updated_at
       FROM pain_locations pl
       LEFT JOIN program_types pt ON pt.code = pl.program_type
       ${whereClause}
       ORDER BY pl.program_type, pl.position, pl.code`,
      params
    );
    res.json({ data: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Admin get pain-locations error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения локаций боли' });
  }
});

// GET /api/admin/pain-locations/:code — одна локация
router.get('/pain-locations/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await query(
      `SELECT pl.code, pl.program_type, pt.label AS program_type_label,
              pl.label, pl.position, pl.is_red_flag, pl.red_flag_reason,
              pl.is_active, pl.created_at, pl.updated_at
       FROM pain_locations pl
       LEFT JOIN program_types pt ON pt.code = pl.program_type
       WHERE pl.code = $1`,
      [code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Локация не найдена' });
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Admin get pain-location error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения локации' });
  }
});

// POST /api/admin/pain-locations — создать новую локацию
router.post('/pain-locations', async (req, res) => {
  const { code, program_type, label, position, is_red_flag, red_flag_reason } = req.body;

  if (!code || typeof code !== 'string' || !/^[a-z_]+$/.test(code) || code.length > 50) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'code обязателен, latin lowercase + underscore, до 50 символов'
    });
  }
  if (!program_type || !label || typeof label !== 'string' || label.length === 0 || label.length > 100) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'program_type и label (1..100 символов) обязательны'
    });
  }
  if (is_red_flag && (!red_flag_reason || red_flag_reason.length > 255)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Для red-flag локации red_flag_reason обязателен (≤255 символов)'
    });
  }

  try {
    const ptCheck = await query('SELECT code FROM program_types WHERE code = $1', [program_type]);
    if (ptCheck.rows.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `program_type "${program_type}" не существует`
      });
    }

    const result = await query(
      `INSERT INTO pain_locations (code, program_type, label, position, is_red_flag, red_flag_reason, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING *`,
      [code, program_type, label, position ?? 0, !!is_red_flag, is_red_flag ? red_flag_reason : null]
    );

    await logAudit(req, 'CREATE', 'pain_location', null, {
      code, program_type, label, is_red_flag: !!is_red_flag
    });

    res.status(201).json({ data: result.rows[0], message: 'Локация создана' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: `Локация с code="${code}" уже существует` });
    }
    console.error('Admin create pain-location error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка создания локации' });
  }
});

// PUT /api/admin/pain-locations/:code — обновить label / position / is_red_flag / reason / is_active.
// code и program_type immutable.
router.put('/pain-locations/:code', async (req, res) => {
  const { code } = req.params;
  const { label, position, is_red_flag, red_flag_reason, is_active } = req.body;

  if (label !== undefined && (typeof label !== 'string' || label.length === 0 || label.length > 100)) {
    return res.status(400).json({ error: 'Validation Error', message: 'label длина 1..100' });
  }
  if (is_red_flag === true && (!red_flag_reason || red_flag_reason.length > 255)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Для red-flag локации red_flag_reason обязателен (≤255 символов)'
    });
  }

  try {
    const sets = [];
    const params = [];
    let idx = 1;

    if (label !== undefined) { sets.push(`label = $${idx++}`); params.push(label); }
    if (position !== undefined) { sets.push(`position = $${idx++}`); params.push(position); }
    if (is_red_flag !== undefined) {
      sets.push(`is_red_flag = $${idx++}`);
      params.push(!!is_red_flag);
      if (is_red_flag === false) {
        sets.push(`red_flag_reason = NULL`);
      }
    }
    if (red_flag_reason !== undefined && is_red_flag !== false) {
      sets.push(`red_flag_reason = $${idx++}`);
      params.push(red_flag_reason);
    }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(!!is_active); }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'Нет полей для обновления' });
    }

    sets.push(`updated_at = NOW()`);
    params.push(code);

    const result = await query(
      `UPDATE pain_locations SET ${sets.join(', ')} WHERE code = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Локация не найдена' });
    }

    await logAudit(req, 'UPDATE', 'pain_location', null, { code, changes: req.body });

    res.json({ data: result.rows[0], message: 'Локация обновлена' });
  } catch (error) {
    console.error('Admin update pain-location error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка обновления локации' });
  }
});

// DELETE /api/admin/pain-locations/:code — hard delete только если нет ссылок из pain_entry_locations.
// При наличии ссылок — 409 с подсказкой деактивировать (is_active=false) через PUT.
router.delete('/pain-locations/:code', async (req, res) => {
  const { code } = req.params;

  try {
    const refsCheck = await query(
      `SELECT COUNT(*)::int AS cnt FROM pain_entry_locations WHERE location_code = $1`,
      [code]
    );
    const cnt = refsCheck.rows[0]?.cnt ?? 0;
    if (cnt > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Локация используется в ${cnt} записях боли. Деактивируйте (is_active=false) вместо удаления.`
      });
    }

    const result = await query('DELETE FROM pain_locations WHERE code = $1 RETURNING code', [code]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Локация не найдена' });
    }

    await logAudit(req, 'DELETE', 'pain_location', null, { code });

    res.json({ data: { code }, message: 'Локация удалена' });
  } catch (error) {
    console.error('Admin delete pain-location error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка удаления локации' });
  }
});

// =====================================================
// КОНТЕНТ: СОВЕТЫ (TIPS)
// =====================================================

// GET /api/admin/tips — все советы
router.get('/tips', async (req, res) => {
  try {
    const { program_type, category, phase_number } = req.query;
    let sql = 'SELECT * FROM tips WHERE 1=1';
    const params = [];

    if (program_type) {
      params.push(program_type);
      sql += ` AND program_type = $${params.length}`;
    }
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    if (phase_number) {
      params.push(parseInt(phase_number));
      sql += ` AND phase_number = $${params.length}`;
    }

    sql += ' ORDER BY program_type, phase_number, category, id';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Admin get tips error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения советов' });
  }
});

// POST /api/admin/tips — создать совет
router.post('/tips', async (req, res) => {
  try {
    const { program_type = 'general', phase_number, category = 'motivation', title, body, icon } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Заголовок и текст обязательны'
      });
    }

    if (!['motivation', 'nutrition', 'recovery', 'exercise'].includes(category)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Недопустимая категория'
      });
    }

    const result = await query(
      `INSERT INTO tips (program_type, phase_number, category, title, body, icon)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [program_type, phase_number || null, category, title, body, icon || null]
    );

    await logAudit(req, 'CREATE', 'tip', result.rows[0].id, { title, category });
    res.status(201).json({ data: result.rows[0], message: 'Совет создан' });
  } catch (error) {
    console.error('Admin create tip error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка создания совета' });
  }
});

// PUT /api/admin/tips/:id — обновить совет
router.put('/tips/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { program_type, phase_number, category, title, body, icon } = req.body;

    if (category && !['motivation', 'nutrition', 'recovery', 'exercise'].includes(category)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Недопустимая категория'
      });
    }

    const result = await query(
      `UPDATE tips SET
        program_type = COALESCE($1, program_type),
        phase_number = COALESCE($2, phase_number),
        category = COALESCE($3, category),
        title = COALESCE($4, title),
        body = COALESCE($5, body),
        icon = COALESCE($6, icon),
        updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [program_type || null, phase_number !== undefined ? phase_number : null, category || null, title || null, body || null, icon || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Совет не найден' });
    }

    await logAudit(req, 'UPDATE', 'tip', parseInt(id), { title });
    res.json({ data: result.rows[0], message: 'Совет обновлён' });
  } catch (error) {
    console.error('Admin update tip error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка обновления совета' });
  }
});

// DELETE /api/admin/tips/:id — soft delete
router.delete('/tips/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE tips SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Совет не найден' });
    }

    await logAudit(req, 'DELETE', 'tip', parseInt(id), { title: result.rows[0].title });
    res.json({ data: result.rows[0], message: 'Совет деактивирован' });
  } catch (error) {
    console.error('Admin delete tip error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка удаления совета' });
  }
});

// =====================================================
// КОНТЕНТ: ВИДЕО ФАЗ
// =====================================================

// GET /api/admin/videos — все видео
router.get('/videos', async (req, res) => {
  try {
    const { phase_id } = req.query;
    let sql = `SELECT pv.*, rp.title as phase_title, rp.program_type, rp.phase_number
               FROM phase_videos pv
               LEFT JOIN rehab_phases rp ON pv.phase_id = rp.id`;
    const params = [];

    if (phase_id) {
      params.push(parseInt(phase_id));
      sql += ` WHERE pv.phase_id = $${params.length}`;
    }

    sql += ' ORDER BY pv.phase_id, pv.order_number';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Admin get videos error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения видео' });
  }
});

// POST /api/admin/videos — создать видео
router.post('/videos', async (req, res) => {
  try {
    const { phase_id, title, description, video_url, thumbnail_url, duration_seconds, order_number = 0 } = req.body;

    if (!phase_id || !title || !video_url) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Фаза, название и URL видео обязательны'
      });
    }

    // Проверка существования фазы
    const phaseCheck = await query('SELECT id FROM rehab_phases WHERE id = $1', [phase_id]);
    if (phaseCheck.rows.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Указанная фаза не существует'
      });
    }

    const result = await query(
      `INSERT INTO phase_videos (phase_id, title, description, video_url, thumbnail_url, duration_seconds, order_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [phase_id, title, description || null, video_url, thumbnail_url || null, duration_seconds || null, order_number]
    );

    await logAudit(req, 'CREATE', 'video', result.rows[0].id, { title, phase_id });
    res.status(201).json({ data: result.rows[0], message: 'Видео создано' });
  } catch (error) {
    console.error('Admin create video error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка создания видео' });
  }
});

// PUT /api/admin/videos/:id — обновить видео
router.put('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { phase_id, title, description, video_url, thumbnail_url, duration_seconds, order_number } = req.body;

    const result = await query(
      `UPDATE phase_videos SET
        phase_id = COALESCE($1, phase_id),
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        video_url = COALESCE($4, video_url),
        thumbnail_url = COALESCE($5, thumbnail_url),
        duration_seconds = COALESCE($6, duration_seconds),
        order_number = COALESCE($7, order_number),
        updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [phase_id || null, title || null, description || null, video_url || null, thumbnail_url || null, duration_seconds || null, order_number !== undefined ? order_number : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Видео не найдено' });
    }

    await logAudit(req, 'UPDATE', 'video', parseInt(id), { title });
    res.json({ data: result.rows[0], message: 'Видео обновлено' });
  } catch (error) {
    console.error('Admin update video error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка обновления видео' });
  }
});

// DELETE /api/admin/videos/:id — soft delete
router.delete('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE phase_videos SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Видео не найдено' });
    }

    await logAudit(req, 'DELETE', 'video', parseInt(id), { title: result.rows[0].title });
    res.json({ data: result.rows[0], message: 'Видео деактивировано' });
  } catch (error) {
    console.error('Admin delete video error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка удаления видео' });
  }
});

// =====================================================
// СИСТЕМНАЯ ИНФОРМАЦИЯ
// =====================================================

// GET /api/admin/system — информация о системе
router.get('/system', async (req, res) => {
  try {
    const uptimeSeconds = process.uptime();
    const memory = process.memoryUsage();

    let dbStatus = false;
    let dbSize = 'N/A';
    try {
      dbStatus = await testConnection();
      const sizeResult = await query('SELECT pg_size_pretty(pg_database_size(current_database())) as size');
      dbSize = sizeResult.rows[0].size;
    } catch (e) {
      // DB not available
    }

    res.json({
      data: {
        server_uptime: uptimeSeconds,
        server_uptime_formatted: formatUptime(uptimeSeconds),
        node_version: process.version,
        environment: config.nodeEnv,
        memory_usage: {
          rss: formatBytes(memory.rss),
          heap_used: formatBytes(memory.heapUsed),
          heap_total: formatBytes(memory.heapTotal),
          external: formatBytes(memory.external)
        },
        db_connected: dbStatus,
        db_size: dbSize,
        telegram_bot_active: !!config.telegram.botToken,
        telegram_bot_username: config.telegram.botUsername,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Admin system info error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения системной информации' });
  }
});

// Форматирование uptime
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}д`);
  if (h > 0) parts.push(`${h}ч`);
  if (m > 0) parts.push(`${m}м`);
  parts.push(`${s}с`);
  return parts.join(' ');
}

// Форматирование байтов
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============================================================================
// OPS ALERTS (Wave 2 коммит 2.04)
// Incident-журнал для admin triage. Записи создаются из routes/rehab.js
// triggerRedFlagAlert при red-flag pain_entry. Telegram отправка — в utils/opsAlert.js.
// ============================================================================

/**
 * GET /api/admin/ops-alerts
 * Filters: resolved (true|false), alert_type, severity, patient_id, limit, offset.
 * JOIN на pain_entries даёт VAS+notes+is_event прямо в списке для админ-триажа.
 */
router.get('/ops-alerts', async (req, res) => {
  try {
    const { resolved, alert_type, severity, patient_id } = req.query;
    const conditions = [];
    const params = [];

    if (resolved === 'true') conditions.push('oa.resolved_at IS NOT NULL');
    else if (resolved === 'false') conditions.push('oa.resolved_at IS NULL');
    if (alert_type) {
      params.push(alert_type);
      conditions.push(`oa.alert_type = $${params.length}`);
    }
    if (severity) {
      params.push(severity);
      conditions.push(`oa.severity   = $${params.length}`);
    }
    if (patient_id) {
      params.push(parseInt(patient_id, 10));
      conditions.push(`oa.patient_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    params.push(limit);
    params.push(offset);

    const { rows } = await query(
      `SELECT
         oa.id, oa.patient_id, p.full_name AS patient_name, p.phone AS patient_phone,
         oa.alert_type, oa.severity,
         oa.source_entity_type, oa.source_entity_id, oa.details,
         oa.telegram_attempted_at, oa.telegram_dedup_key,
         oa.resolved_at, oa.resolved_by_user_id, oa.resolution_notes,
         oa.created_at,
         pe.vas_score   AS pain_vas_score,
         pe.notes       AS pain_notes,
         pe.is_event    AS pain_is_event,
         pe.entry_date  AS pain_entry_date
       FROM ops_alerts oa
       LEFT JOIN patients p ON p.id = oa.patient_id
       LEFT JOIN pain_entries pe
         ON oa.source_entity_type = 'pain_entry' AND pe.id = oa.source_entity_id
       ${whereClause}
       ORDER BY oa.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('GET /admin/ops-alerts error:', err.message);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить алерты' });
  }
});

/**
 * PUT /api/admin/ops-alerts/:id/resolve
 * Body: { resolution_notes? }
 */
router.put('/ops-alerts/:id/resolve', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ValidationError', message: 'id должен быть числом' });
  }
  const { resolution_notes } = req.body;

  try {
    const { rows } = await query(
      `UPDATE ops_alerts
       SET resolved_at = NOW(), resolved_by_user_id = $1,
           resolution_notes = $2, updated_at = NOW()
       WHERE id = $3 AND resolved_at IS NULL
       RETURNING *`,
      [req.user.id, resolution_notes ?? null, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Алерт не найден или уже резолвлен' });
    }

    await logAudit(req, 'RESOLVE', 'ops_alert', id, { resolution_notes });

    return res.json({ data: rows[0], message: 'Алерт резолвлен' });
  } catch (err) {
    console.error('PUT /admin/ops-alerts/:id/resolve error:', err.message);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось резолвить' });
  }
});

module.exports = router;
