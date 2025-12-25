const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// Отметить выполнение упражнения (БЕЗ авторизации - для пациента)
router.post('/', async (req, res) => {
  try {
    console.log('=== Progress Save Request ===');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Session ID:', req.body?.session_id);
    console.log('Session Comment:', req.body?.session_comment);

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
        session_id ?? null,
        session_comment ?? null,
        comment ?? notes ?? null,
        completed ? new Date() : null
      ]
    );

    console.log('=== Progress Saved Successfully ===');
    console.log('Record ID:', result.rows[0]?.id);
    console.log('Session ID:', result.rows[0]?.session_id);

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
       ORDER BY COALESCE(pl.completed_at, pl.created_at) DESC`,
      [complex_id]
    );

    // Статистика выполнения
    const statsResult = await query(
      `SELECT 
         COUNT(*) as total_logs,
         COUNT(*) FILTER (WHERE completed = true) as completed_count,
         AVG(pain_level) FILTER (WHERE pain_level IS NOT NULL) as avg_pain_level,
         AVG(difficulty_rating) FILTER (WHERE difficulty_rating IS NOT NULL) as avg_difficulty,
         COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) as total_sessions,
         COUNT(DISTINCT DATE(completed_at)) as unique_days
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

// Получить общий прогресс пациента по всем комплексам
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    const complexesQuery = `
      SELECT 
        c.id,
        c.diagnosis_id,
        c.is_active,
        c.created_at,
        d.name as diagnosis_name,
        COUNT(DISTINCT pl.session_id) FILTER (WHERE pl.session_id IS NOT NULL) as total_sessions,
        COUNT(pl.id) as total_logs,
        COUNT(pl.id) FILTER (WHERE pl.completed = true) as completed_count,
        AVG(pl.pain_level) FILTER (WHERE pl.pain_level IS NOT NULL) as avg_pain,
        AVG(pl.difficulty_rating) FILTER (WHERE pl.difficulty_rating IS NOT NULL) as avg_difficulty,
        MAX(pl.completed_at) as last_activity
      FROM complexes c
      LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
      LEFT JOIN progress_logs pl ON c.id = pl.complex_id
      WHERE c.patient_id = $1
      GROUP BY c.id, d.name
      ORDER BY c.created_at DESC
    `;

    const complexesResult = await query(complexesQuery, [patientId]);

    const patientQuery = `
      SELECT id, full_name, email, phone, created_at
      FROM patients
      WHERE id = $1
    `;
    const patientResult = await query(patientQuery, [patientId]);

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const overallStatsQuery = `
      SELECT 
        COUNT(DISTINCT pl.session_id) FILTER (WHERE pl.session_id IS NOT NULL) as total_sessions,
        COUNT(DISTINCT DATE(pl.completed_at)) as unique_days,
        COUNT(pl.id) as total_logs,
        AVG(pl.pain_level) FILTER (WHERE pl.pain_level IS NOT NULL) as overall_avg_pain,
        AVG(pl.difficulty_rating) FILTER (WHERE pl.difficulty_rating IS NOT NULL) as overall_avg_difficulty
      FROM progress_logs pl
      JOIN complexes c ON pl.complex_id = c.id
      WHERE c.patient_id = $1
    `;
    const overallStatsResult = await query(overallStatsQuery, [patientId]);
    const overallStatsRow = overallStatsResult.rows[0] || {};
    const overallStats = {
      total_sessions: parseInt(overallStatsRow.total_sessions, 10) || 0,
      unique_days: parseInt(overallStatsRow.unique_days, 10) || 0,
      total_logs: parseInt(overallStatsRow.total_logs, 10) || 0,
      overall_avg_pain: parseFloat(overallStatsRow.overall_avg_pain) || 0,
      overall_avg_difficulty: parseFloat(overallStatsRow.overall_avg_difficulty) || 0
    };

    res.json({
      patient: patientResult.rows[0],
      complexes: complexesResult.rows.map((row) => ({
        ...row,
        total_sessions: parseInt(row.total_sessions, 10) || 0,
        total_logs: parseInt(row.total_logs, 10) || 0,
        completed_count: parseInt(row.completed_count, 10) || 0,
        avg_pain: parseFloat(row.avg_pain) || 0,
        avg_difficulty: parseFloat(row.avg_difficulty) || 0
      })),
      overallStats
    });
  } catch (error) {
    console.error('Error fetching patient progress:', error);
    res.status(500).json({ error: 'Failed to fetch patient progress' });
  }
});

module.exports = router;
