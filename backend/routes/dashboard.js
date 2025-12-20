const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Получить статистику для dashboard
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Количество пациентов
    const patientsResult = await query(
      'SELECT COUNT(*) as count FROM patients WHERE created_by = $1 AND is_active = true',
      [req.user.id]
    );

    // Количество комплексов
    const complexesResult = await query(
      'SELECT COUNT(*) as count FROM complexes WHERE instructor_id = $1 AND is_active = true',
      [req.user.id]
    );

    // Количество упражнений (всего в базе)
    const exercisesResult = await query(
      'SELECT COUNT(*) as count FROM exercises WHERE is_active = true'
    );

    // Средний процент выполнения
    const completionResult = await query(
      `SELECT 
         COUNT(DISTINCT ce.id) as total_exercises,
         COUNT(DISTINCT pl.id) FILTER (WHERE pl.completed = true) as completed_exercises
       FROM complexes c
       LEFT JOIN complex_exercises ce ON c.id = ce.complex_id
       LEFT JOIN progress_logs pl ON ce.exercise_id = pl.exercise_id AND ce.complex_id = pl.complex_id
       WHERE c.instructor_id = $1 AND c.is_active = true`,
      [req.user.id]
    );

    const totalExercises = parseInt(completionResult.rows[0].total_exercises) || 0;
    const completedExercises = parseInt(completionResult.rows[0].completed_exercises) || 0;
    const completionPercent = totalExercises > 0 
      ? Math.round((completedExercises / totalExercises) * 100) 
      : 0;

    res.json({
      patients_count: parseInt(patientsResult.rows[0].count),
      complexes_count: parseInt(complexesResult.rows[0].count),
      exercises_count: parseInt(exercisesResult.rows[0].count),
      completion_percent: completionPercent
    });

  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении статистики' 
    });
  }
});

module.exports = router;