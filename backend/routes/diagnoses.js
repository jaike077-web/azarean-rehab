const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// =====================================================
// GET /api/diagnoses - Получить все диагнозы
// =====================================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        id,
        name,
        category,
        description,
        recommendations,
        warnings,
        is_active,
        created_at,
        updated_at
      FROM diagnoses
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `);

    res.json({
      success: true,
      diagnoses: result.rows
    });
  } catch (error) {
    console.error('Ошибка получения диагнозов:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении диагнозов'
    });
  }
});

// =====================================================
// GET /api/diagnoses/:id - Получить один диагноз
// =====================================================
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(`
      SELECT 
        id,
        name,
        category,
        description,
        recommendations,
        warnings,
        is_active,
        created_at,
        updated_at
      FROM diagnoses
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Диагноз не найден'
      });
    }

    res.json({
      success: true,
      diagnosis: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка получения диагноза:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении диагноза'
    });
  }
});

// =====================================================
// POST /api/diagnoses - Создать новый диагноз
// =====================================================
router.post('/', authenticateToken, async (req, res) => {
  const { name, description, recommendations, warnings } = req.body;

  // Валидация
  if (!name || name.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Название диагноза обязательно'
    });
  }

  try {
    // Проверка на дубликат
    const duplicate = await query(
      'SELECT id FROM diagnoses WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL',
      [name.trim()]
    );

    if (duplicate.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Диагноз с таким названием уже существует'
      });
    }

    // Преобразуем пустые строки в null
    const descriptionValue = description && description.trim() ? description.trim() : null;
    const recommendationsValue = recommendations && recommendations.trim() ? recommendations.trim() : null;
    const warningsValue = warnings && warnings.trim() ? warnings.trim() : null;

    // Создание
    const result = await query(`
      INSERT INTO diagnoses (name, description, recommendations, warnings)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, description, recommendations, warnings, created_at
    `, [
      name.trim(),
      descriptionValue,
      recommendationsValue,
      warningsValue
    ]);

    res.status(201).json({
      success: true,
      message: 'Диагноз успешно создан',
      diagnosis: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка создания диагноза:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при создании диагноза'
    });
  }
});

// =====================================================
// PUT /api/diagnoses/:id - Обновить диагноз
// =====================================================
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, description, recommendations, warnings } = req.body;

  // Валидация
  if (!name || name.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Название диагноза обязательно'
    });
  }

  try {
    // Проверка существования
    const exists = await query(
      'SELECT id FROM diagnoses WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (exists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Диагноз не найден'
      });
    }

    // Проверка на дубликат (исключая текущий)
    const duplicate = await query(
      'SELECT id FROM diagnoses WHERE LOWER(name) = LOWER($1) AND id != $2 AND deleted_at IS NULL',
      [name.trim(), id]
    );

    if (duplicate.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Диагноз с таким названием уже существует'
      });
    }

    // Преобразуем пустые строки в null
    const descriptionValue = description && description.trim() ? description.trim() : null;
    const recommendationsValue = recommendations && recommendations.trim() ? recommendations.trim() : null;
    const warningsValue = warnings && warnings.trim() ? warnings.trim() : null;

    // Обновление
    const result = await query(`
      UPDATE diagnoses
      SET 
        name = $1,
        description = $2,
        recommendations = $3,
        warnings = $4,
        updated_at = NOW()
      WHERE id = $5 AND deleted_at IS NULL
      RETURNING id, name, description, recommendations, warnings, updated_at
    `, [
      name.trim(),
      descriptionValue,
      recommendationsValue,
      warningsValue,
      id
    ]);

    res.json({
      success: true,
      message: 'Диагноз успешно обновлен',
      diagnosis: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка обновления диагноза:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении диагноза'
    });
  }
});

// =====================================================
// DELETE /api/diagnoses/:id - Удалить диагноз (soft delete)
// =====================================================
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Проверка существования
    const exists = await query(
      'SELECT id FROM diagnoses WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (exists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Диагноз не найден'
      });
    }

    // Проверка использования в комплексах
    const inUse = await query(
      'SELECT COUNT(*) as count FROM complexes WHERE diagnosis_id = $1',
      [id]
    );

    if (parseInt(inUse.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: `Диагноз используется в ${inUse.rows[0].count} комплекс(ах). Удаление невозможно.`
      });
    }

    // Soft delete
    await query(`
      UPDATE diagnoses
      SET deleted_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({
      success: true,
      message: 'Диагноз успешно удален'
    });
  } catch (error) {
    console.error('Ошибка удаления диагноза:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при удалении диагноза'
    });
  }
});

// =====================================================
// POST /api/diagnoses/:id/restore - Восстановить диагноз
// =====================================================
router.post('/:id/restore', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(`
      UPDATE diagnoses
      SET deleted_at = NULL, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NOT NULL
      RETURNING id, name
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Диагноз не найден'
      });
    }

    res.json({
      success: true,
      message: 'Диагноз успешно восстановлен',
      diagnosis: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка восстановления диагноза:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при восстановлении диагноза'
    });
  }
});

module.exports = router;