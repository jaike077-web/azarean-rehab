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
    const { full_name, email, phone, birth_date, notes } = req.body;

    // Валидация
    if (!full_name) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Имя пациента обязательно' 
      });
    }

    const result = await query(
      `INSERT INTO patients (full_name, email, phone, birth_date, notes, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [full_name, email, phone, birth_date, notes, req.user.id]
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
    const { full_name, email, phone, birth_date, notes } = req.body;

    const result = await query(
      `UPDATE patients 
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           birth_date = COALESCE($4, birth_date),
           notes = COALESCE($5, notes),
           updated_at = NOW()
       WHERE id = $6 AND created_by = $7 AND is_active = true
       RETURNING *`,
      [full_name, email, phone, birth_date, notes, id, req.user.id]
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