const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

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
    if (!patient_id || !exercises || !Array.isArray(exercises) || exercises.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Validation Error',
        message: 'ID пациента и список упражнений обязательны'
      });
    }

    // Валидация структуры каждого упражнения
    for (const ex of exercises) {
      if (!ex.exercise_id || !ex.order_number) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Каждое упражнение должно содержать exercise_id и order_number'
        });
      }
    }

    // Проверяем что пациент принадлежит этому инструктору (FOR UPDATE предотвращает race condition)
    const patientCheck = await client.query(
      'SELECT id FROM patients WHERE id = $1 AND created_by = $2 FOR UPDATE',
      [patient_id, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Нет доступа к этому пациенту' 
      });
    }

    // Создаем комплекс (access_token больше не генерируется — пациент получает
    // доступ только через личный кабинет, см. миграцию 20260409_complexes_access_token_nullable.sql)
    const complexResult = await client.query(
      `INSERT INTO complexes
       (patient_id, instructor_id, diagnosis_id, diagnosis_note, recommendations, warnings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [patient_id, req.user.id, diagnosis_id, diagnosis_note, recommendations, warnings]
    );

    const complex = complexResult.rows[0];

    // Добавляем упражнения в комплекс
    for (const exercise of exercises) {
      const durationSeconds = Math.max(0, Number(exercise.duration_seconds) || 0);
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
      complex: fullComplexResult.rows[0]
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

// Получить упражнения комплекса
router.get('/:id/exercises', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
         ce.exercise_id,
         ce.order_number,
         e.title,
         e.body_region,
         e.video_url
       FROM complex_exercises ce
       JOIN exercises e ON ce.exercise_id = e.id
       JOIN complexes c ON ce.complex_id = c.id
       WHERE ce.complex_id = $1 AND c.instructor_id = $2 AND c.is_active = true
       ORDER BY ce.order_number ASC`,
      [id, req.user.id]
    );

    res.json({
      complexId: id,
      exercises: result.rows
    });
  } catch (error) {
    console.error('Error fetching complex exercises:', error);
    res.status(500).json({ error: 'Failed to fetch complex exercises' });
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
      const durationSeconds = Math.max(0, Number(exercise.duration_seconds) || 0);
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
  const client = await getClient();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Сначала проверяем ownership
    const complexCheck = await client.query(
      'SELECT id FROM complexes WHERE id = $1 AND instructor_id = $2',
      [id, req.user.id]
    );

    if (complexCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Not Found',
        message: 'Комплекс не найден'
      });
    }

    // Удаляем связанные данные в правильном порядке
    await client.query('DELETE FROM progress_logs WHERE complex_id = $1', [id]);
    await client.query('DELETE FROM complex_exercises WHERE complex_id = $1', [id]);
    await client.query('DELETE FROM complexes WHERE id = $1', [id]);

    await client.query('COMMIT');

    res.json({
      message: 'Комплекс удалён навсегда',
      id: parseInt(id)
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ошибка полного удаления комплекса:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при удалении комплекса'
    });
  } finally {
    client.release();
  }
});

module.exports = router;

