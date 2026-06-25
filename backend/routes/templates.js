// =====================================================
// TEMPLATES ROUTES - Azarean Network
// =====================================================

const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Все роуты защищены
router.use(authenticateToken);

// =====================================================
// GET /api/templates - Получить все шаблоны пользователя
// =====================================================
router.get('/', async (req, res) => {
  try {
    const { diagnosis_id } = req.query;
    const params = [req.user.id];
    let diagnosisFilter = '';

    if (diagnosis_id) {
      params.push(diagnosis_id);
      diagnosisFilter = ` AND t.diagnosis_id = $${params.length}`;
    }

    const result = await query(`
      SELECT 
        t.*,
        d.name as diagnosis_name,
        COUNT(te.id) as exercises_count
      FROM templates t
      LEFT JOIN diagnoses d ON t.diagnosis_id = d.id
      LEFT JOIN template_exercises te ON t.id = te.template_id
      WHERE t.created_by = $1${diagnosisFilter}
      GROUP BY t.id, d.name
      ORDER BY t.created_at DESC
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    console.error('Ошибка получения шаблонов:', err);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка сервера' });
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
      return res.status(404).json({ error: 'Not Found', message: 'Шаблон не найден' });
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
      data: { template: templateResult.rows[0], exercises: exercisesResult.rows }
    });
  } catch (err) {
    console.error('Ошибка получения шаблона:', err);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка сервера' });
  }
});

// =====================================================
// POST /api/templates - Создать шаблон
// =====================================================
router.post('/', async (req, res) => {
  const { name, description, diagnosis_id, exercises } = req.body;

  if (!name || !exercises || exercises.length === 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Название и упражнения обязательны' });
  }

  // Транзакция: шаблон + упражнения атомарно — иначе при сбое в середине цикла
  // (напр. битый exercise_id) шаблон создаётся с частичным набором упражнений.
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const templateResult = await client.query(`
      INSERT INTO templates (name, description, diagnosis_id, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, description || null, diagnosis_id || null, req.user.id]);

    const template = templateResult.rows[0];

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await client.query(`
        INSERT INTO template_exercises
        (template_id, exercise_id, order_number, sets, reps, duration_seconds, rest_seconds, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        template.id,
        ex.exercise_id,
        i + 1,
        ex.sets || 3,
        ex.reps || 10,
        ex.duration_seconds || null,
        ex.rest_seconds ?? 30,
        ex.notes || null
      ]);
    }

    await client.query('COMMIT');
    res.status(201).json({ data: template, message: 'Шаблон создан' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка создания шаблона:', err);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// =====================================================
// PUT /api/templates/:id - Обновить шаблон
// =====================================================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, diagnosis_id, exercises } = req.body;

  // Транзакция: UPDATE шаблона + DELETE старых + INSERT новых упражнений атомарно.
  // Без неё сбой в середине цикла оставляет шаблон БЕЗ старых упражнений и с
  // частичным новым набором (потеря данных).
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const checkResult = await client.query(
      'SELECT id FROM templates WHERE id = $1 AND created_by = $2',
      [id, req.user.id]
    );
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not Found', message: 'Шаблон не найден' });
    }

    await client.query(`
      UPDATE templates
      SET name = $1, description = $2, diagnosis_id = $3, updated_at = NOW()
      WHERE id = $4
    `, [name, description || null, diagnosis_id || null, id]);

    if (exercises && exercises.length > 0) {
      await client.query('DELETE FROM template_exercises WHERE template_id = $1', [id]);
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        await client.query(`
          INSERT INTO template_exercises
          (template_id, exercise_id, order_number, sets, reps, duration_seconds, rest_seconds, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          id,
          ex.exercise_id,
          i + 1,
          ex.sets || 3,
          ex.reps || 10,
          ex.duration_seconds || null,
          ex.rest_seconds ?? 30,
          ex.notes || null
        ]);
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Шаблон обновлён' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка обновления шаблона:', err);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка сервера' });
  } finally {
    client.release();
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
      return res.status(404).json({ error: 'Not Found', message: 'Шаблон не найден' });
    }

    res.json({ message: 'Шаблон удалён' });
  } catch (err) {
    console.error('Ошибка удаления шаблона:', err);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка сервера' });
  }
});

module.exports = router;
