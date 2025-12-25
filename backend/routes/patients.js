const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Получить всех своих пациентов
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, 
              COUNT(DISTINCT c.id) as complexes_count
       FROM patients p
       LEFT JOIN complexes c ON p.id = c.patient_id AND c.is_active = true
       WHERE p.created_by = $1 AND p.is_active = true
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    res.json({
      total: result.rows.length,
      patients: result.rows
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
      `SELECT p.*, 
              COUNT(DISTINCT c.id) as complexes_count
       FROM patients p
       LEFT JOIN complexes c ON p.id = c.patient_id
       WHERE p.created_by = $1 AND p.is_active = false
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
      [req.user.id]
    );

    res.json({
      total: result.rows.length,
      patients: result.rows
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

    res.json(patients);
  } catch (error) {
    console.error('Ошибка получения пациентов с прогрессом:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// Получить одного пациента
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Получаем пациента
    const patientResult = await query(
      `SELECT * FROM patients 
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
      patient,
      complexes: complexesResult.rows
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
router.post('/', authenticateToken, async (req, res) => {
  try {
    // ИЗМЕНЕНО: добавлен diagnosis
    const { full_name, email, phone, birth_date, diagnosis, notes } = req.body;

    // Валидация
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Имя пациента обязательно' 
      });
    }

    // Преобразуем пустые строки в null для необязательных полей
    const emailValue = email && email.trim() ? email.trim() : null;
    const phoneValue = phone && phone.trim() ? phone.trim() : null;
    const birthDateValue = birth_date && birth_date.trim() ? birth_date.trim() : null;
    const diagnosisValue = diagnosis && diagnosis.trim() ? diagnosis.trim() : null; // ДОБАВЛЕНО
    const notesValue = notes && notes.trim() ? notes.trim() : null;

    // ИЗМЕНЕНО: добавлен diagnosis в INSERT
    const result = await query(
      `INSERT INTO patients (full_name, email, phone, birth_date, diagnosis, notes, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [full_name.trim(), emailValue, phoneValue, birthDateValue, diagnosisValue, notesValue, req.user.id]
    );

    res.status(201).json({
      message: 'Пациент успешно создан',
      patient: result.rows[0]
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
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // ИЗМЕНЕНО: добавлен diagnosis
    const { full_name, email, phone, birth_date, diagnosis, notes } = req.body;

    // Преобразуем пустые строки в null
    const fullNameValue = full_name && full_name.trim() ? full_name.trim() : null;
    const emailValue = email && email.trim() ? email.trim() : null;
    const phoneValue = phone && phone.trim() ? phone.trim() : null;
    const birthDateValue = birth_date && birth_date.trim() ? birth_date.trim() : null;
    const diagnosisValue = diagnosis && diagnosis.trim() ? diagnosis.trim() : null; // ДОБАВЛЕНО
    const notesValue = notes && notes.trim() ? notes.trim() : null;

    // ИЗМЕНЕНО: добавлен diagnosis в UPDATE
    const result = await query(
      `UPDATE patients 
       SET full_name = COALESCE($1, full_name),
           email = $2,
           phone = $3,
           birth_date = $4,
           diagnosis = $5,
           notes = $6,
           updated_at = NOW()
       WHERE id = $7 AND created_by = $8 AND is_active = true
       RETURNING *`,
      [fullNameValue, emailValue, phoneValue, birthDateValue, diagnosisValue, notesValue, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Пациент не найден' 
      });
    }

    res.json({
      message: 'Данные пациента успешно обновлены',
      patient: result.rows[0]
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
      message: 'Пациент успешно восстановлен',
      id: result.rows[0].id
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
      message: 'Пациент успешно удален',
      id: result.rows[0].id
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
  try {
    const { id } = req.params;

    // Сначала удаляем все связанные комплексы
    await query('DELETE FROM complex_exercises WHERE complex_id IN (SELECT id FROM complexes WHERE patient_id = $1)', [id]);
    await query('DELETE FROM progress_logs WHERE complex_id IN (SELECT id FROM complexes WHERE patient_id = $1)', [id]);
    await query('DELETE FROM complexes WHERE patient_id = $1', [id]);
    
    // Теперь удаляем пациента
    const result = await query(
      `DELETE FROM patients 
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
      message: 'Пациент удалён навсегда',
      id: result.rows[0].id
    });

  } catch (error) {
    console.error('Ошибка полного удаления пациента:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при удалении пациента' 
    });
  }
});

module.exports = router;
