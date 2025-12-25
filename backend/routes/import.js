const express = require('express');
const multer = require('multer');
const { query, getClient } = require('../database/db');
const kinescopeService = require('../services/kinescopeService');
const csvImportService = require('../services/csvImportService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configure multer for CSV upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

router.use(authenticateToken);

const toJsonOrNull = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
};

/**
 * GET /api/import/kinescope/preview
 * Fetch videos from Kinescope for preview before import
 */
router.get('/kinescope/preview', async (req, res) => {
  try {
    const videos = await kinescopeService.fetchAllVideos();
    const kinescopeIds = videos.map((video) => video.id);

    let existingIds = new Set();
    if (kinescopeIds.length > 0) {
      const existingQuery = `
        SELECT kinescope_id
        FROM exercises
        WHERE kinescope_id = ANY($1)
      `;
      const existingResult = await query(existingQuery, [kinescopeIds]);
      existingIds = new Set(existingResult.rows.map((row) => row.kinescope_id));
    }

    const videosWithStatus = videos.map((video) => ({
      id: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      duration: video.duration,
      play_link: video.play_link,
      created_at: video.created_at,
      alreadyImported: existingIds.has(video.id),
    }));

    res.json({
      total: videosWithStatus.length,
      newVideos: videosWithStatus.filter((video) => !video.alreadyImported).length,
      existingVideos: videosWithStatus.filter((video) => video.alreadyImported).length,
      videos: videosWithStatus,
    });
  } catch (error) {
    console.error('Error fetching Kinescope videos:', error);
    res.status(500).json({
      error: 'Failed to fetch videos from Kinescope',
      message: error.message,
    });
  }
});

/**
 * POST /api/import/kinescope/execute
 * Import selected videos from Kinescope
 */
router.post('/kinescope/execute', async (req, res) => {
  const client = await getClient();

  try {
    const { videoIds } = req.body;

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'No videos selected for import' });
    }

    await client.query('BEGIN');

    const importResults = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    for (const videoId of videoIds) {
      try {
        const checkQuery = 'SELECT id FROM exercises WHERE kinescope_id = $1';
        const existing = await client.query(checkQuery, [videoId]);

        if (existing.rows.length > 0) {
          importResults.skipped += 1;
          continue;
        }

        const videoDetails = await kinescopeService.getVideoDetails(videoId);
        const exerciseData = kinescopeService.transformToExercise(videoDetails);

        const insertQuery = `
          INSERT INTO exercises (
            title,
            video_url,
            thumbnail_url,
            kinescope_id,
            duration_seconds,
            body_region,
            exercise_type,
            difficulty_level,
            equipment,
            description,
            instructions,
            contraindications,
            tips
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `;

        await client.query(insertQuery, [
          exerciseData.title,
          exerciseData.video_url,
          exerciseData.thumbnail_url,
          exerciseData.kinescope_id,
          exerciseData.duration_seconds,
          exerciseData.body_region,
          exerciseData.exercise_type,
          exerciseData.difficulty_level,
          toJsonOrNull(exerciseData.equipment),
          exerciseData.description,
          toJsonOrNull(exerciseData.instructions),
          toJsonOrNull(exerciseData.contraindications),
          toJsonOrNull(exerciseData.tips),
        ]);

        importResults.success += 1;
      } catch (error) {
        console.error(`Error importing video ${videoId}:`, error);
        importResults.failed += 1;
        importResults.errors.push({
          videoId,
          error: error.message,
        });
      }
    }

    await client.query('COMMIT');

    res.json({
      message: 'Import completed',
      results: importResults,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during Kinescope import:', error);
    res.status(500).json({ error: 'Import failed', message: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/import/csv
 * Import/update exercises from CSV file
 */
router.post('/csv', upload.single('file'), async (req, res) => {
  const client = await getClient();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvData = req.file.buffer.toString('utf-8');
    const exercises = await csvImportService.parseCSV(csvData);

    if (exercises.length === 0) {
      return res.status(400).json({ error: 'No valid data in CSV file' });
    }

    await client.query('BEGIN');

    const importResults = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (const exercise of exercises) {
      try {
        let existingQuery;
        let existingParams;

        if (exercise.kinescope_id) {
          existingQuery = 'SELECT id FROM exercises WHERE kinescope_id = $1';
          existingParams = [exercise.kinescope_id];
        } else {
          existingQuery = 'SELECT id FROM exercises WHERE title = $1';
          existingParams = [exercise.title];
        }

        const existing = await client.query(existingQuery, existingParams);

        if (existing.rows.length > 0) {
          const updateQuery = `
            UPDATE exercises SET
              title = COALESCE($1, title),
              description = COALESCE($2, description),
              body_region = COALESCE($3, body_region),
              exercise_type = COALESCE($4, exercise_type),
              difficulty_level = COALESCE($5, difficulty_level),
              equipment = COALESCE($6, equipment),
              instructions = COALESCE($7, instructions),
              contraindications = COALESCE($8, contraindications),
              tips = COALESCE($9, tips)
            WHERE id = $10
          `;

          await client.query(updateQuery, [
            exercise.title,
            exercise.description,
            exercise.body_region,
            exercise.exercise_type,
            exercise.difficulty_level,
            toJsonOrNull(exercise.equipment),
            toJsonOrNull(exercise.instructions),
            toJsonOrNull(exercise.contraindications),
            toJsonOrNull(exercise.tips),
            existing.rows[0].id,
          ]);

          importResults.updated += 1;
        } else {
          const insertQuery = `
            INSERT INTO exercises (
              title,
              video_url,
              thumbnail_url,
              kinescope_id,
              description,
              body_region,
              exercise_type,
              difficulty_level,
              equipment,
              instructions,
              contraindications,
              tips
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `;

          await client.query(insertQuery, [
            exercise.title,
            exercise.video_url || null,
            exercise.thumbnail_url || null,
            exercise.kinescope_id || null,
            exercise.description,
            exercise.body_region,
            exercise.exercise_type,
            exercise.difficulty_level || 2,
            toJsonOrNull(exercise.equipment),
            toJsonOrNull(exercise.instructions),
            toJsonOrNull(exercise.contraindications),
            toJsonOrNull(exercise.tips),
          ]);

          importResults.created += 1;
        }
      } catch (error) {
        console.error('Error processing CSV row:', error);
        importResults.failed += 1;
        importResults.errors.push({
          title: exercise.title,
          error: error.message,
        });
      }
    }

    await client.query('COMMIT');

    res.json({
      message: 'CSV import completed',
      results: importResults,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during CSV import:', error);
    res.status(500).json({ error: 'CSV import failed', message: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/import/csv/template
 * Download CSV template
 */
router.get('/csv/template', (req, res) => {
  const template = `title,kinescope_id,description,body_region,exercise_type,difficulty_level,equipment,instructions,contraindications,tips
"L - отведение бедра","kinescope_abc123","Упражнение для укрепления отводящих мышц бедра","Бедро","Силовое",2,"[]","Лягте на бок, медленно поднимайте верхнюю ногу","Острая боль в тазобедренном суставе","Держите корпус стабильным"
"Приседания","kinescope_def456","Базовое упражнение для ног","Колено","Силовое",3,"[]","Ноги на ширине плеч, приседайте до параллели","Травмы коленей","Колени не выходят за носки"`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=exercises_template.csv');
  res.send(template);
});

module.exports = router;
