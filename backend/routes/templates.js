// =====================================================
// TEMPLATES ROUTES - Azarean Network
// =====================================================

const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Все роуты защищены
router.use(authenticateToken);

// =====================================================
// GET /api/templates - Получить все шаблоны пользователя
// =====================================================
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        t.*,
        d.name as diagnosis_name,
        COUNT(te.id) as exercises_count
      FROM templates t
      LEFT JOIN diagnoses d ON t.diagnosis_id = d.id
      LEFT JOIN template_exercises te ON t.id = te.template_id
      WHERE t.created_by = $1
      GROUP BY t.id, d.name
      ORDER BY t.created_at DESC
    `, [req.user.id]);

    res.json({ templates: result.rows });
  } catch (err) {
    console.error('Ошибка получения шаблонов:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// =====================================================
// GET /api/templates/:id - Получить шаблон с упражнениями
// =====================================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Получаем шаблон
    const templateResult = await query(`
      SELECT t.*, d.name as diagnosis_name
      FROM templates t
      LEFT JOIN diagnoses d ON t.diagnosis_id = d.id
      WHERE t.id = $1 AND t.created_by = $2
    `, [id, req.user.id]);

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ message: 'Шаблон не найден' });
    }

    // Получаем упражнения шаблона
    const exercisesResult = await query(`
      SELECT 
        te.*,
        e.title,
        e.body_region,
        e.description
      FROM template_exercises te
      JOIN exercises e ON te.exercise_id = e.id
      WHERE te.template_id = $1
      ORDER BY te.order_number
    `, [id]);

    res.json({
      template: templateResult.rows[0],
      exercises: exercisesResult.rows
    });
  } catch (err) {
    console.error('Ошибка получения шаблона:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// =====================================================
// POST /api/templates - Создать шаблон
// =====================================================
router.post('/', async (req, res) => {
  try {
    const { name, description, diagnosis_id, exercises } = req.body;

    if (!name || !exercises || exercises.length === 0) {
      return res.status(400).json({ message: 'Название и упражнения обязательны' });
    }

    // Создаём шаблон
    const templateResult = await query(`
      INSERT INTO templates (name, description, diagnosis_id, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, description || null, diagnosis_id || null, req.user.id]);

    const template = templateResult.rows[0];

    // Добавляем упражнения
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await query(`
        INSERT INTO template_exercises 
        (template_id, exercise_id, order_number, sets, reps, duration_seconds, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        template.id,
        ex.exercise_id,
        i + 1,
        ex.sets || 3,
        ex.reps || 10,
        ex.duration_seconds || null,
        ex.notes || null
      ]);
    }

    res.status(201).json({ 
      message: 'Шаблон создан',
      template 
    });
  } catch (err) {
    console.error('Ошибка создания шаблона:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// =====================================================
// PUT /api/templates/:id - Обновить шаблон
// =====================================================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, diagnosis_id, exercises } = req.body;

    // Проверяем владельца
    const checkResult = await query(
      'SELECT id FROM templates WHERE id = $1 AND created_by = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Шаблон не найден' });
    }

    // Обновляем шаблон
    await query(`
      UPDATE templates 
      SET name = $1, description = $2, diagnosis_id = $3, updated_at = NOW()
      WHERE id = $4
    `, [name, description || null, diagnosis_id || null, id]);

    // Если переданы упражнения — обновляем их
    if (exercises && exercises.length > 0) {
      // Удаляем старые
      await query('DELETE FROM template_exercises WHERE template_id = $1', [id]);

      // Добавляем новые
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        await query(`
          INSERT INTO template_exercises 
          (template_id, exercise_id, order_number, sets, reps, duration_seconds, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          id,
          ex.exercise_id,
          i + 1,
          ex.sets || 3,
          ex.reps || 10,
          ex.duration_seconds || null,
          ex.notes || null
        ]);
      }
    }

    res.json({ message: 'Шаблон обновлён' });
  } catch (err) {
    console.error('Ошибка обновления шаблона:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// =====================================================
// DELETE /api/templates/:id - Удалить шаблон
// =====================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM templates WHERE id = $1 AND created_by = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Шаблон не найден' });
    }

    res.json({ message: 'Шаблон удалён' });
  } catch (err) {
    console.error('Ошибка удаления шаблона:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;