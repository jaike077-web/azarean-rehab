// backend/routes/exercises.js
// Обновленная версия с поддержкой JSONB и минимальной валидацией

const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// ========================================
// GET /api/exercises/kinescope/thumbnail/:videoId - Получение превью из Kinescope
// ========================================

router.get('/kinescope/thumbnail/:videoId', authenticateToken, async (req, res) => {
  try {
    const { videoId } = req.params;
    const apiToken = process.env.KINESCOPE_API_TOKEN;

    if (!apiToken) {
      return res.status(500).json({ error: 'Kinescope API токен не настроен' });
    }

    const response = await fetch(`https://api.kinescope.io/v1/videos/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Kinescope API error:', response.status);
      return res.status(response.status).json({ error: 'Ошибка получения данных из Kinescope' });
    }

    const data = await response.json();
    
    // Kinescope возвращает poster в разных форматах
    const posterUrl = data.data?.poster?.original || 
                      data.data?.poster?.lg || 
                      data.data?.poster?.md ||
                      data.data?.poster ||
                      null;

    res.json({ 
      thumbnail_url: posterUrl,
      title: data.data?.title,
      duration: data.data?.duration
    });
  } catch (error) {
    console.error('Error fetching Kinescope thumbnail:', error);
    res.status(500).json({ error: 'Ошибка при получении превью' });
  }
});

// ========================================
// GET /api/exercises - Список упражнений с фильтрацией
// ========================================

router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      search,           // Поиск по названию
      body_region,      // Фильтр по региону
      difficulty,       // Фильтр по сложности
      equipment,        // Фильтр по оборудованию (может быть массив)
      position,         // Фильтр по положению (может быть массив)
      rehab_phase,      // Фильтр по фазе реабилитации
      page = 1,         // Пагинация
      limit = 50
    } = req.query;

    let query = `
      SELECT 
        id,
        title,
        short_title,
        description,
        video_url,
        thumbnail_url,
        exercise_type,
        body_region,
        difficulty_level,
        equipment,        -- JSONB массив
        position,         -- JSONB массив
        rehab_phases,     -- JSONB массив
        is_active,
        created_at
      FROM exercises
      WHERE is_active = true
    `;
    
    const values = [];
    let paramCount = 0;

    // Поиск по названию
    if (search) {
      paramCount++;
      query += ` AND title ILIKE $${paramCount}`;
      values.push(`%${search}%`);
    }

    // Фильтр по региону тела
    if (body_region) {
      paramCount++;
      query += ` AND body_region = $${paramCount}`;
      values.push(body_region);
    }

    // Фильтр по сложности
    if (difficulty) {
      paramCount++;
      query += ` AND difficulty_level = $${paramCount}`;
      values.push(parseInt(difficulty));
    }

    // Фильтр по оборудованию (JSONB contains)
    if (equipment) {
      const equipmentArray = Array.isArray(equipment) ? equipment : [equipment];
      paramCount++;
      query += ` AND equipment ?| $${paramCount}`;
      values.push(equipmentArray);
    }

    // Фильтр по положению (JSONB contains)
    if (position) {
      const positionArray = Array.isArray(position) ? position : [position];
      paramCount++;
      query += ` AND position ?| $${paramCount}`;
      values.push(positionArray);
    }

    // Фильтр по фазе реабилитации (JSONB contains)
    if (rehab_phase) {
      paramCount++;
      query += ` AND rehab_phases @> $${paramCount}`;
      values.push(JSON.stringify([rehab_phase]));
    }

    // Сортировка
    query += ' ORDER BY title ASC';

    // Пагинация
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    values.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    values.push(offset);

    const result = await query(query, values);

    // Подсчет общего количества (для пагинации)
    let countQuery = 'SELECT COUNT(*) FROM exercises WHERE is_active = true';
    const countValues = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      countQuery += ` AND title ILIKE $${countParamCount}`;
      countValues.push(`%${search}%`);
    }
    if (body_region) {
      countParamCount++;
      countQuery += ` AND body_region = $${countParamCount}`;
      countValues.push(body_region);
    }
    if (difficulty) {
      countParamCount++;
      countQuery += ` AND difficulty_level = $${countParamCount}`;
      countValues.push(parseInt(difficulty));
    }

    const countResult = await query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      exercises: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching exercises:', error);
    res.status(500).json({ error: 'Ошибка при загрузке упражнений' });
  }
});

// ========================================
// GET /api/exercises/stats/summary - Статистика библиотеки
// ========================================

router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN body_region = 'shoulder' THEN 1 END) as shoulder_count,
        COUNT(CASE WHEN body_region = 'knee' THEN 1 END) as knee_count,
        COUNT(CASE WHEN body_region = 'spine' THEN 1 END) as spine_count,
        COUNT(CASE WHEN body_region = 'hip' THEN 1 END) as hip_count,
        AVG(difficulty_level) as avg_difficulty
      FROM exercises
      WHERE is_active = true
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Ошибка при загрузке статистики' });
  }
});

// ========================================
// GET /api/exercises/:id - Одно упражнение
// ========================================

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT * FROM exercises WHERE id = $1 AND is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Упражнение не найдено' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching exercise:', error);
    res.status(500).json({ error: 'Ошибка при загрузке упражнения' });
  }
});

// ========================================
// POST /api/exercises - Создание упражнения
// ========================================

router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      // ОБЯЗАТЕЛЬНЫЕ поля
      title,
      video_url,
      
      // ОПЦИОНАЛЬНЫЕ поля
      short_title,
      description,
      thumbnail_url,
      exercise_type,
      body_region,
      difficulty_level = 1,
      
      // МНОЖЕСТВЕННЫЙ ВЫБОР (массивы)
      equipment = [],
      position = [],
      rehab_phases = [],
      
      // ИНСТРУКЦИИ
      instructions,
      cues,
      tips,
      contraindications,
      absolute_contraindications,
      red_flags,
      safe_with_inflammation = false
    } = req.body;

    // ========================================
    // ВАЛИДАЦИЯ ОБЯЗАТЕЛЬНЫХ ПОЛЕЙ
    // ========================================
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Название упражнения обязательно' });
    }

    if (!video_url || !video_url.trim()) {
      return res.status(400).json({ error: 'Ссылка на видео обязательна' });
    }

    // Валидация URL
    try {
      new URL(video_url);
    } catch (e) {
      return res.status(400).json({ error: 'Некорректная ссылка на видео' });
    }

    // ========================================
    // АВТОМАТИЧЕСКОЕ ПОЛУЧЕНИЕ THUMBNAIL ИЗ KINESCOPE
    // ========================================
    
    let finalThumbnailUrl = thumbnail_url?.trim() || null;
    
    // Если thumbnail не указан, пробуем получить из Kinescope
    if (!finalThumbnailUrl && video_url.includes('kinescope.io')) {
      const kinescopeMatch = video_url.match(/kinescope\.io\/(?:embed\/|watch\/)?([a-zA-Z0-9]+)/);
      if (kinescopeMatch) {
        const videoId = kinescopeMatch[1];
        const apiToken = process.env.KINESCOPE_API_TOKEN;
        
        if (apiToken) {
          try {
            const response = await fetch(`https://api.kinescope.io/v1/videos/${videoId}`, {
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              finalThumbnailUrl = data.data?.poster?.original || 
                                  data.data?.poster?.lg || 
                                  data.data?.poster?.md ||
                                  null;
            }
          } catch (err) {
            console.error('Failed to fetch Kinescope thumbnail:', err);
            // Продолжаем без thumbnail
          }
        }
      }
    }

    // ========================================
    // ВАЛИДАЦИЯ ОПЦИОНАЛЬНЫХ ПОЛЕЙ
    // ========================================

    // Валидация сложности (1-5)
    if (difficulty_level < 1 || difficulty_level > 5) {
      return res.status(400).json({ error: 'Уровень сложности должен быть от 1 до 5' });
    }

    // Валидация массивов
    if (!Array.isArray(equipment)) {
      return res.status(400).json({ error: 'equipment должен быть массивом' });
    }
    if (!Array.isArray(position)) {
      return res.status(400).json({ error: 'position должен быть массивом' });
    }
    if (!Array.isArray(rehab_phases)) {
      return res.status(400).json({ error: 'rehab_phases должен быть массивом' });
    }

    // ========================================
    // ВСТАВКА В БД
    // ========================================

    const result = await query(
      `INSERT INTO exercises (
        title,
        short_title,
        description,
        video_url,
        thumbnail_url,
        exercise_type,
        body_region,
        difficulty_level,
        equipment,
        position,
        rehab_phases,
        instructions,
        cues,
        tips,
        contraindications,
        absolute_contraindications,
        red_flags,
        safe_with_inflammation,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      ) RETURNING *`,
      [
        title.trim(),
        short_title?.trim() || null,
        description?.trim() || null,
        video_url.trim(),
        finalThumbnailUrl,
        exercise_type || null,
        body_region || null,
        difficulty_level,
        JSON.stringify(equipment),      // JSONB
        JSON.stringify(position),        // JSONB
        JSON.stringify(rehab_phases),    // JSONB
        instructions?.trim() || null,
        cues?.trim() || null,
        tips?.trim() || null,
        contraindications?.trim() || null,
        absolute_contraindications?.trim() || null,
        red_flags?.trim() || null,
        safe_with_inflammation,
        req.user.id
      ]
    );

    res.status(201).json({
      message: 'Упражнение создано',
      exercise: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating exercise:', error);
    res.status(500).json({ error: 'Ошибка при создании упражнения' });
  }
});

// ========================================
// POST /api/exercises/bulk - Массовое создание упражнений
// ========================================

router.post('/bulk', authenticateToken, async (req, res) => {
  const client = await getClient();

  try {
    const { exercises } = req.body;

    if (!Array.isArray(exercises) || exercises.length === 0) {
      return res.status(400).json({ error: 'Список упражнений обязателен' });
    }

    const results = {
      created: 0,
      failed: 0,
      errors: [],
    };

    await client.query('BEGIN');

    for (const exercise of exercises) {
      try {
        const {
          title,
          video_url,
          short_title,
          description,
          thumbnail_url,
          exercise_type,
          body_region,
          difficulty_level = 1,
          equipment = [],
          position = [],
          rehab_phases = [],
          instructions,
          cues,
          tips,
          contraindications,
          absolute_contraindications,
          red_flags,
          safe_with_inflammation = false,
        } = exercise;

        if (!title || !title.trim()) {
          throw new Error('Название упражнения обязательно');
        }

        if (!video_url || !video_url.trim()) {
          throw new Error('Ссылка на видео обязательна');
        }

        try {
          new URL(video_url);
        } catch (error) {
          throw new Error('Некорректная ссылка на видео');
        }

        await client.query(
          `INSERT INTO exercises (
            title,
            short_title,
            description,
            video_url,
            thumbnail_url,
            exercise_type,
            body_region,
            difficulty_level,
            equipment,
            position,
            rehab_phases,
            instructions,
            cues,
            tips,
            contraindications,
            absolute_contraindications,
            red_flags,
            safe_with_inflammation,
            created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          )`,
          [
            title.trim(),
            short_title?.trim() || null,
            description?.trim() || null,
            video_url.trim(),
            thumbnail_url?.trim() || null,
            exercise_type || null,
            body_region || null,
            difficulty_level,
            JSON.stringify(Array.isArray(equipment) ? equipment : []),
            JSON.stringify(Array.isArray(position) ? position : []),
            JSON.stringify(Array.isArray(rehab_phases) ? rehab_phases : []),
            instructions?.trim() || null,
            cues?.trim() || null,
            tips?.trim() || null,
            contraindications?.trim() || null,
            absolute_contraindications?.trim() || null,
            red_flags?.trim() || null,
            safe_with_inflammation,
            req.user.id,
          ]
        );

        results.created += 1;
      } catch (error) {
        results.failed += 1;
        results.errors.push({
          title: exercise?.title || 'Без названия',
          error: error.message,
        });
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Импорт завершен',
      results,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating exercises in bulk:', error);
    res.status(500).json({ error: 'Ошибка при массовом создании упражнений' });
  } finally {
    client.release();
  }
});

// ========================================
// PUT /api/exercises/:id - Обновление упражнения
// ========================================

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      video_url,
      short_title,
      description,
      thumbnail_url,
      exercise_type,
      body_region,
      difficulty_level,
      equipment,
      position,
      rehab_phases,
      instructions,
      cues,
      tips,
      contraindications,
      absolute_contraindications,
      red_flags,
      safe_with_inflammation
    } = req.body;

    // Валидация обязательных полей
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Название упражнения обязательно' });
    }

    if (!video_url || !video_url.trim()) {
      return res.status(400).json({ error: 'Ссылка на видео обязательна' });
    }

    try {
      new URL(video_url);
    } catch (e) {
      return res.status(400).json({ error: 'Некорректная ссылка на видео' });
    }

    // Проверка существования упражнения
    const existing = await query(
      'SELECT id, thumbnail_url, video_url FROM exercises WHERE id = $1 AND is_active = true',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Упражнение не найдено' });
    }

    // ========================================
    // АВТОМАТИЧЕСКОЕ ПОЛУЧЕНИЕ THUMBNAIL ИЗ KINESCOPE
    // ========================================
    
    let finalThumbnailUrl = thumbnail_url?.trim() || null;
    const oldVideoUrl = existing.rows[0].video_url;
    const videoUrlChanged = video_url.trim() !== oldVideoUrl;
    
    // Если video_url изменился или thumbnail не указан, пробуем получить из Kinescope
    if ((!finalThumbnailUrl || videoUrlChanged) && video_url.includes('kinescope.io')) {
      const kinescopeMatch = video_url.match(/kinescope\.io\/(?:embed\/|watch\/)?([a-zA-Z0-9]+)/);
      if (kinescopeMatch) {
        const videoId = kinescopeMatch[1];
        const apiToken = process.env.KINESCOPE_API_TOKEN;
        
        if (apiToken) {
          try {
            const response = await fetch(`https://api.kinescope.io/v1/videos/${videoId}`, {
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              finalThumbnailUrl = data.data?.poster?.original || 
                                  data.data?.poster?.lg || 
                                  data.data?.poster?.md ||
                                  finalThumbnailUrl;
            }
          } catch (err) {
            console.error('Failed to fetch Kinescope thumbnail:', err);
          }
        }
      }
    }

    // Обновление
    const result = await query(
      `UPDATE exercises SET
        title = $1,
        short_title = $2,
        description = $3,
        video_url = $4,
        thumbnail_url = $5,
        exercise_type = $6,
        body_region = $7,
        difficulty_level = $8,
        equipment = $9,
        position = $10,
        rehab_phases = $11,
        instructions = $12,
        cues = $13,
        tips = $14,
        contraindications = $15,
        absolute_contraindications = $16,
        red_flags = $17,
        safe_with_inflammation = $18,
        updated_at = NOW()
      WHERE id = $19
      RETURNING *`,
      [
        title.trim(),
        short_title?.trim() || null,
        description?.trim() || null,
        video_url.trim(),
        finalThumbnailUrl,
        exercise_type || null,
        body_region || null,
        difficulty_level || 1,
        JSON.stringify(equipment || []),
        JSON.stringify(position || []),
        JSON.stringify(rehab_phases || []),
        instructions?.trim() || null,
        cues?.trim() || null,
        tips?.trim() || null,
        contraindications?.trim() || null,
        absolute_contraindications?.trim() || null,
        red_flags?.trim() || null,
        safe_with_inflammation || false,
        id
      ]
    );

    res.json({
      message: 'Упражнение обновлено',
      exercise: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating exercise:', error);
    res.status(500).json({ error: 'Ошибка при обновлении упражнения' });
  }
});

// ========================================
// POST /api/exercises/:id/fetch-thumbnail - Получить thumbnail для существующего упражнения
// ========================================

router.post('/:id/fetch-thumbnail', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Получаем упражнение
    const existing = await query(
      'SELECT id, video_url, thumbnail_url FROM exercises WHERE id = $1 AND is_active = true',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Упражнение не найдено' });
    }

    const exercise = existing.rows[0];
    
    if (!exercise.video_url || !exercise.video_url.includes('kinescope.io')) {
      return res.status(400).json({ error: 'Видео не из Kinescope' });
    }

    const kinescopeMatch = exercise.video_url.match(/kinescope\.io\/(?:embed\/|watch\/)?([a-zA-Z0-9]+)/);
    if (!kinescopeMatch) {
      return res.status(400).json({ error: 'Не удалось извлечь ID видео' });
    }

    const videoId = kinescopeMatch[1];
    const apiToken = process.env.KINESCOPE_API_TOKEN;
    
    if (!apiToken) {
      return res.status(500).json({ error: 'Kinescope API токен не настроен' });
    }

    const response = await fetch(`https://api.kinescope.io/v1/videos/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Ошибка Kinescope API' });
    }

    const data = await response.json();
    const thumbnailUrl = data.data?.poster?.original || 
                         data.data?.poster?.lg || 
                         data.data?.poster?.md ||
                         null;

    if (!thumbnailUrl) {
      return res.status(404).json({ error: 'Превью не найдено в Kinescope' });
    }

    // Обновляем в БД
    await query(
      'UPDATE exercises SET thumbnail_url = $1, updated_at = NOW() WHERE id = $2',
      [thumbnailUrl, id]
    );

    res.json({ 
      message: 'Превью обновлено',
      thumbnail_url: thumbnailUrl 
    });
  } catch (error) {
    console.error('Error fetching thumbnail:', error);
    res.status(500).json({ error: 'Ошибка при получении превью' });
  }
});

// ========================================
// POST /api/exercises/fetch-all-thumbnails - Получить превью для всех упражнений
// ========================================

router.post('/fetch-all-thumbnails', authenticateToken, async (req, res) => {
  try {
    // Только admin может запускать массовое обновление
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    const apiToken = process.env.KINESCOPE_API_TOKEN;
    if (!apiToken) {
      return res.status(500).json({ error: 'Kinescope API токен не настроен' });
    }

    // Получаем все упражнения без thumbnail с Kinescope видео
    const exercises = await query(`
      SELECT id, video_url 
      FROM exercises 
      WHERE is_active = true 
        AND (thumbnail_url IS NULL OR thumbnail_url = '')
        AND video_url LIKE '%kinescope.io%'
    `);

    let updated = 0;
    let failed = 0;

    for (const exercise of exercises.rows) {
      const kinescopeMatch = exercise.video_url.match(/kinescope\.io\/(?:embed\/|watch\/)?([a-zA-Z0-9]+)/);
      if (!kinescopeMatch) {
        failed++;
        continue;
      }

      const videoId = kinescopeMatch[1];

      try {
        const response = await fetch(`https://api.kinescope.io/v1/videos/${videoId}`, {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          const thumbnailUrl = data.data?.poster?.original || 
                               data.data?.poster?.lg || 
                               data.data?.poster?.md;

          if (thumbnailUrl) {
            await query(
              'UPDATE exercises SET thumbnail_url = $1, updated_at = NOW() WHERE id = $2',
              [thumbnailUrl, exercise.id]
            );
            updated++;
          } else {
            failed++;
          }
        } else {
          failed++;
        }

        // Небольшая задержка чтобы не превысить лимиты API
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`Failed to fetch thumbnail for exercise ${exercise.id}:`, err);
        failed++;
      }
    }

    res.json({ 
      message: 'Обновление завершено',
      total: exercises.rows.length,
      updated,
      failed
    });
  } catch (error) {
    console.error('Error fetching all thumbnails:', error);
    res.status(500).json({ error: 'Ошибка при обновлении превью' });
  }
});

// ========================================
// DELETE /api/exercises/:id - Удаление (soft delete)
// ========================================

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверка прав (только admin может удалять)
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    const result = await query(
      'UPDATE exercises SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Упражнение не найдено' });
    }

    res.json({ message: 'Упражнение удалено' });
  } catch (error) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({ error: 'Ошибка при удалении упражнения' });
  }
});

module.exports = router;
