const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// Отметить выполнение упражнения (БЕЗ авторизации - для пациента)
router.post('/', async (req, res) => {
  try {
    const {
      complex_id,
      exercise_id,
      completed,
      pain_level,
      difficulty_rating,
      session_id,
      session_comment,
      comment,
      notes
    } = req.body;

    // Валидация
    if (!complex_id || !exercise_id) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'ID комплекса и упражнения обязательны' 
      });
    }

    // Проверяем что комплекс и упражнение существуют
    const checkResult = await query(
      `SELECT ce.id 
       FROM complex_exercises ce
       WHERE ce.complex_id = $1 AND ce.exercise_id = $2`,
      [complex_id, exercise_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Упражнение не найдено в этом комплексе' 
      });
    }

    // Добавляем запись о выполнении
    const result = await query(
      `INSERT INTO progress_logs 
       (complex_id, exercise_id, completed, pain_level, difficulty_rating, session_id, session_comment, notes, completed_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [
        complex_id,
        exercise_id,
        completed || false,
        pain_level,
        difficulty_rating,
        session_id,
        session_comment,
        comment ?? notes,
        completed ? new Date() : null
      ]
    );

    res.status(201).json({
      message: 'Прогресс успешно сохранен',
      progress: result.rows[0]
    });

  } catch (error) {
    console.error('Ошибка сохранения прогресса:', {
      message: error.message,
      stack: error.stack,
      payload: {
        complex_id: req.body?.complex_id,
        exercise_id: req.body?.exercise_id,
        completed: req.body?.completed,
        pain_level: req.body?.pain_level,
        difficulty_rating: req.body?.difficulty_rating,
        session_id: req.body?.session_id
      }
    });
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при сохранении прогресса' 
    });
  }
});

// Получить прогресс по комплексу (для инструктора или пациента)
router.get('/complex/:complex_id', async (req, res) => {
  try {
    const { complex_id } = req.params;

    const result = await query(
      `SELECT pl.*,
              e.title as exercise_title,
              e.body_region as exercise_category
       FROM progress_logs pl
       JOIN exercises e ON pl.exercise_id = e.id
       WHERE pl.complex_id = $1
       ORDER BY pl.created_at DESC`,
      [complex_id]
    );

    // Статистика выполнения
    const statsResult = await query(
      `SELECT 
         COUNT(*) as total_logs,
         COUNT(*) FILTER (WHERE completed = true) as completed_count,
         AVG(pain_level) FILTER (WHERE pain_level IS NOT NULL) as avg_pain_level,
         AVG(difficulty_rating) FILTER (WHERE difficulty_rating IS NOT NULL) as avg_difficulty
       FROM progress_logs
       WHERE complex_id = $1`,
      [complex_id]
    );

    res.json({
      total: result.rows.length,
      logs: result.rows,
      statistics: statsResult.rows[0]
    });

  } catch (error) {
    console.error('Ошибка получения прогресса:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении прогресса' 
    });
  }
});

// Получить прогресс конкретного упражнения
router.get('/exercise/:exercise_id/complex/:complex_id', async (req, res) => {
  try {
    const { exercise_id, complex_id } = req.params;

    const result = await query(
      `SELECT pl.*
       FROM progress_logs pl
       WHERE pl.exercise_id = $1 AND pl.complex_id = $2
       ORDER BY pl.created_at DESC`,
      [exercise_id, complex_id]
    );

    res.json({
      total: result.rows.length,
      logs: result.rows
    });

  } catch (error) {
    console.error('Ошибка получения прогресса упражнения:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении прогресса' 
    });
  }
});

module.exports = router;
