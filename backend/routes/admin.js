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

// GET /api/admin/users — список всех юзеров
router.get('/users', async (req, res) => {
  try {
    const { role, is_active } = req.query;

    let sql = `SELECT id, email, full_name, role, is_active, created_at, updated_at,
                      failed_login_attempts, locked_until
               FROM users WHERE 1=1`;
    const params = [];

    if (role) {
      params.push(role);
      sql += ` AND role = $${params.length}`;
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      sql += ` AND is_active = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);
    res.json({ data: result.rows });
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
      return res.status(400).json({
        error: 'Validation Error',
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
    const { full_name, role, is_active } = req.body;

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

    const result = await query(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        role = COALESCE($2, role),
        is_active = COALESCE($3, is_active),
        updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, full_name, role, is_active, created_at, updated_at`,
      [full_name || null, role || null, is_active !== undefined ? is_active : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Пользователь не найден' });
    }

    await logAudit(req, 'UPDATE', 'user', parseInt(id), { full_name, role, is_active });
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
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
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

module.exports = router;
