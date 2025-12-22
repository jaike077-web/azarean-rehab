const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query, getClient } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Генерация уникального токена для доступа пациента
function generateAccessToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Создать новый комплекс для пациента
router.post('/', authenticateToken, async (req, res) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    const {
      patient_id,
      diagnosis_id,
      diagnosis_note,
      recommendations,
      warnings,
      exercises
    } = req.body;

    // Валидация
    if (!patient_id || !exercises || exercises.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'ID пациента и список упражнений обязательны' 
      });
    }

    // Проверяем что пациент принадлежит этому инструктору
    const patientCheck = await client.query(
      'SELECT id FROM patients WHERE id = $1 AND created_by = $2',
      [patient_id, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Нет доступа к этому пациенту' 
      });
    }

    // Генерируем уникальный токен
    const access_token = generateAccessToken();

    // Создаем комплекс
    const complexResult = await client.query(
      `INSERT INTO complexes 
       (patient_id, instructor_id, diagnosis_id, diagnosis_note, recommendations, warnings, access_token) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [patient_id, req.user.id, diagnosis_id, diagnosis_note, recommendations, warnings, access_token]
    );

    const complex = complexResult.rows[0];

    // Добавляем упражнения в комплекс
    for (const exercise of exercises) {
      const durationSeconds = Number(exercise.duration_seconds) || 0;
      await client.query(
        `INSERT INTO complex_exercises 
         (complex_id, exercise_id, order_number, sets, reps, duration_seconds, rest_seconds, notes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          complex.id,
          exercise.exercise_id,
          exercise.order_number,
          exercise.sets || 3,
          exercise.reps || 10,
          durationSeconds,
          exercise.rest_seconds || 30,
          exercise.notes
        ]
      );
    }

    await client.query('COMMIT');

    // Получаем полный комплекс с упражнениями
    const fullComplexResult = await query(
      `SELECT c.*,
              p.full_name as patient_name,
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
                    'exercise_type', e.exercise_type,
                    'difficulty_level', e.difficulty_level,
                    'equipment', e.equipment,
                    'instructions', e.instructions,
                    'contraindications', e.contraindications
                  )
                ) ORDER BY ce.order_number
              ) as exercises
       FROM complexes c
       JOIN patients p ON c.patient_id = p.id
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       JOIN users u ON c.instructor_id = u.id
       JOIN complex_exercises ce ON c.id = ce.complex_id
       JOIN exercises e ON ce.exercise_id = e.id
       WHERE c.id = $1
       GROUP BY c.id, p.full_name, d.name, u.full_name`,
      [complex.id]
    );

    res.status(201).json({
      message: 'Комплекс успешно создан',
      complex: fullComplexResult.rows[0],
      patient_link: `http://localhost:5000/patient/${access_token}`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ошибка создания комплекса:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при создании комплекса' 
    });
  } finally {
    client.release();
  }
});

// Получить все комплексы текущего инструктора
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*,
              p.full_name as patient_name,
              d.name as diagnosis_name,
              COUNT(DISTINCT ce.id) as exercises_count,
              COUNT(DISTINCT pl.id) FILTER (WHERE pl.completed = true) as completions_count
       FROM complexes c
       JOIN patients p ON c.patient_id = p.id
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN complex_exercises ce ON c.id = ce.complex_id
       LEFT JOIN progress_logs pl ON c.id = pl.complex_id
       WHERE c.instructor_id = $1 AND c.is_active = true
       GROUP BY c.id, p.full_name, d.name
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    res.json({
      total: result.rows.length,
      complexes: result.rows
    });

  } catch (error) {
    console.error('Ошибка получения комплексов:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении комплексов' 
    });
  }
});

// Получить удалённые комплексы (корзина) - ВАЖНО: ПЕРЕД /:id
router.get('/trash/list', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*,
              p.full_name as patient_name,
              d.name as diagnosis_name,
              COUNT(DISTINCT ce.id) as exercises_count
       FROM complexes c
       JOIN patients p ON c.patient_id = p.id
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN complex_exercises ce ON c.id = ce.complex_id
       WHERE c.instructor_id = $1 AND c.is_active = false
       GROUP BY c.id, p.full_name, d.name
       ORDER BY c.updated_at DESC`,
      [req.user.id]
    );

    res.json({
      total: result.rows.length,
      complexes: result.rows
    });

  } catch (error) {
    console.error('Ошибка получения удалённых комплексов:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении списка удалённых комплексов' 
    });
  }
});

// Получить комплекс по ID (для инструктора)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT c.*,
              p.full_name as patient_name,
              d.name as diagnosis_name,
              d.recommendations as diagnosis_recommendations,
              d.warnings as diagnosis_warnings,
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
                    'exercise_type', e.exercise_type,
                    'difficulty_level', e.difficulty_level,
                    'equipment', e.equipment,
                    'instructions', e.instructions,
                    'contraindications', e.contraindications,
                    'tips', e.tips
                  )
                ) ORDER BY ce.order_number
              ) as exercises
       FROM complexes c
       JOIN patients p ON c.patient_id = p.id
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       JOIN users u ON c.instructor_id = u.id
       LEFT JOIN complex_exercises ce ON c.id = ce.complex_id
       LEFT JOIN exercises e ON ce.exercise_id = e.id
       WHERE c.id = $1 AND c.instructor_id = $2 AND c.is_active = true
       GROUP BY c.id, p.full_name, d.name, d.recommendations, d.warnings, u.full_name`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Комплекс не найден' 
      });
    }

    res.json({
      complex: result.rows[0]
    });

  } catch (error) {
    console.error('Ошибка получения комплекса:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении комплекса' 
    });
  }
});

// Обновить комплекс
router.put('/:id', authenticateToken, async (req, res) => {
  const client = await getClient();
  
  try {
    const { id } = req.params;
    const { diagnosis_id, recommendations, warnings, exercises } = req.body;

    await client.query('BEGIN');

    // Проверяем что комплекс принадлежит инструктору
    const complexCheck = await client.query(
      'SELECT id FROM complexes WHERE id = $1 AND instructor_id = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (complexCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Комплекс не найден' 
      });
    }

    // Обновляем комплекс
    await client.query(
      `UPDATE complexes SET 
         diagnosis_id = $1,
         recommendations = $2,
         warnings = $3,
         updated_at = NOW()
       WHERE id = $4`,
      [diagnosis_id, recommendations, warnings, id]
    );

    // Удаляем старые упражнения
    await client.query(
      'DELETE FROM complex_exercises WHERE complex_id = $1',
      [id]
    );

    // Добавляем новые упражнения
    for (const exercise of exercises) {
      const durationSeconds = Number(exercise.duration_seconds) || 0;
      await client.query(
        `INSERT INTO complex_exercises 
         (complex_id, exercise_id, order_number, sets, reps, duration_seconds, rest_seconds, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          exercise.exercise_id,
          exercise.order_number,
          exercise.sets,
          exercise.reps,
          durationSeconds,
          exercise.rest_seconds,
          exercise.notes
        ]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'Комплекс успешно обновлён',
      complex_id: id
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating complex:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Не удалось обновить комплекс'
    });
  } finally {
    client.release();
  }
});


// Получить комплекс по токену (для пациента - БЕЗ авторизации!)
router.get('/token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await query(
      `SELECT c.*,
              p.full_name as patient_name,
              d.name as diagnosis_name,
              u.full_name as instructor_name,
              u.email as instructor_email,
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
                    'difficulty_level', e.difficulty_level,
                    'equipment', e.equipment,
                    'instructions', e.instructions,
                    'contraindications', e.contraindications,
                    'tips', e.tips
                  )
                ) ORDER BY ce.order_number
              ) as exercises
       FROM complexes c
       JOIN patients p ON c.patient_id = p.id
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       JOIN users u ON c.instructor_id = u.id
       LEFT JOIN complex_exercises ce ON c.id = ce.complex_id
       LEFT JOIN exercises e ON ce.exercise_id = e.id
       WHERE c.access_token = $1 AND c.is_active = true
       GROUP BY c.id, p.full_name, d.name, u.full_name, u.email`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Комплекс не найден или ссылка недействительна' 
      });
    }

    res.json({
      complex: result.rows[0]
    });

  } catch (error) {
    console.error('Ошибка получения комплекса по токену:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении комплекса' 
    });
  }
});

// Получить все комплексы пациента
router.get('/patient/:patient_id', authenticateToken, async (req, res) => {
  try {
    const { patient_id } = req.params;

    const result = await query(
      `SELECT c.*,
              d.name as diagnosis_name,
              COUNT(ce.id) as exercises_count
       FROM complexes c
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN complex_exercises ce ON c.id = ce.complex_id
       WHERE c.patient_id = $1 AND c.instructor_id = $2 AND c.is_active = true
       GROUP BY c.id, d.name
       ORDER BY c.created_at DESC`,
      [patient_id, req.user.id]
    );

    res.json({
      total: result.rows.length,
      complexes: result.rows
    });

  } catch (error) {
    console.error('Ошибка получения комплексов пациента:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении комплексов' 
    });
  }
});

// Удалить комплекс (мягкое удаление)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE complexes 
       SET is_active = false, updated_at = NOW() 
       WHERE id = $1 AND instructor_id = $2 
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Комплекс не найден' 
      });
    }

    res.json({
      message: 'Комплекс успешно удален',
      id: result.rows[0].id
    });

  } catch (error) {
    console.error('Ошибка удаления комплекса:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при удалении комплекса' 
    });
  }
});

// Восстановить комплекс
router.patch('/:id/restore', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE complexes 
       SET is_active = true, updated_at = NOW() 
       WHERE id = $1 AND instructor_id = $2 
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Комплекс не найден' 
      });
    }

    res.json({
      message: 'Комплекс успешно восстановлен',
      id: result.rows[0].id
    });

  } catch (error) {
    console.error('Ошибка восстановления комплекса:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при восстановлении комплекса' 
    });
  }
});

// Полное удаление комплекса из БД
router.delete('/:id/permanent', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Удаляем связанные данные
    await query('DELETE FROM progress_logs WHERE complex_id = $1', [id]);
    await query('DELETE FROM complex_exercises WHERE complex_id = $1', [id]);
    
    // Удаляем комплекс
    const result = await query(
      `DELETE FROM complexes 
       WHERE id = $1 AND instructor_id = $2 
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Комплекс не найден' 
      });
    }

    res.json({
      message: 'Комплекс удалён навсегда',
      id: result.rows[0].id
    });

  } catch (error) {
    console.error('Ошибка полного удаления комплекса:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при удалении комплекса' 
    });
  }
});

module.exports = router;
