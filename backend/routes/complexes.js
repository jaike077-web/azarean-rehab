const express = require('express');
const router = express.Router();
const { query, getClient } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
// Custom Audio (AA3): валидация cue'ов привязки звуков к комплексу.
const { isValidCueName } = require('../utils/audioFile');
// Exercise Audio (EA3): нормализация/валидация трек-звука упражнения.
const { normalizeExerciseAudio, validateTrackPresetIds } = require('../utils/exerciseAudio');

// =====================================================
// CP2a: нормализация полей упражнения перед INSERT в complex_exercises.
// Семантика:
//   - sets:   number > 0, default 3
//   - reps:   number > 0 → int, иначе null. 0/undefined/NaN → null.
//             (XOR с duration снят, но clean null лучше чем 0 для time-only.)
//   - durationSeconds: > 0 → int, иначе null. Раньше Math.max(0, ...) писал 0;
//             теперь NULL для нормальной семантики CHECK chk_ce_has_prescription.
//   - restSeconds: >= 0, default 30.
//   - autoComplete: boolean, default true (CP2 решение арка).
//   - tempo_*: число-или-null. Все-или-ничего — DB CHECK backstop, тут не дублируем.
// =====================================================
function normalizeExerciseFields(exercise) {
  // Гард '' / null / undefined → null ДО Number(): Number(null)===0 и Number('')===0,
  // из-за чего toIntNonNeg(null) возвращал 0 (а не null). Фронт при пустом темпе шлёт
  // tempo_pause_s: null (явный JSON null) → бэкенд делал pause=0, ecc/con=null →
  // частичное состояние → нарушение chk_ce_tempo → 500 при создании комплекса.
  // Зеркало frontend utils/exerciseValidation.js toPositiveInt/toNonNegativeInt.
  const toIntPositive = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  const toIntNonNeg = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };

  const setsNum = toIntPositive(exercise.sets);
  const sets = setsNum != null ? setsNum : 3;

  const restNum = toIntNonNeg(exercise.rest_seconds);
  const restSeconds = restNum != null ? restNum : 30;

  return {
    sets,
    reps: toIntPositive(exercise.reps),
    durationSeconds: toIntPositive(exercise.duration_seconds),
    restSeconds,
    autoComplete: typeof exercise.auto_complete === 'boolean' ? exercise.auto_complete : true,
    tempoEccentric: toIntPositive(exercise.tempo_eccentric_s),
    tempoPause: toIntNonNeg(exercise.tempo_pause_s),
    tempoConcentric: toIntPositive(exercise.tempo_concentric_s),
  };
}

// =====================================================
// Custom Audio (AA3): привязка звуков к cue'ам комплекса.
// cue_sounds: [{ cue_name, preset_id|null, is_locked }]. Отсутствие cue в
// массиве = наследовать дом-карту; preset_id=null = «явный тон»; дубли cue
// запрещены (иначе UNIQUE(complex_id,cue_name)). Pure-валидатор (Rule #37).
// =====================================================
function validateCueSoundsStructure(cueSounds) {
  if (cueSounds === undefined) return { ok: true }; // не передан → не трогаем привязки
  if (!Array.isArray(cueSounds)) return { ok: false, error: 'cue_sounds должен быть массивом' };
  const seen = new Set();
  for (const cs of cueSounds) {
    if (!cs || typeof cs !== 'object') {
      return { ok: false, error: 'Каждый cue_sound — объект {cue_name, preset_id, is_locked}' };
    }
    if (!isValidCueName(cs.cue_name)) {
      return { ok: false, error: `Некорректный cue_name: ${cs.cue_name}` };
    }
    if (seen.has(cs.cue_name)) {
      return { ok: false, error: `Дубль cue_name: ${cs.cue_name}` };
    }
    seen.add(cs.cue_name);
    if (cs.preset_id !== null && cs.preset_id !== undefined && !Number.isInteger(cs.preset_id)) {
      return { ok: false, error: `preset_id должен быть целым или null (cue ${cs.cue_name})` };
    }
  }
  return { ok: true };
}

// Применяет привязки в ТЕКУЩЕЙ транзакции (client). Структура уже провалидирована.
// replace=true (PUT) — полная замена привязок комплекса (даже [] → очистка → наследование).
// Возвращает { ok } / { ok:false, error } при невалидном (несущ./неактивном) preset_id.
async function applyCueSoundBindings(client, complexId, cueSounds, replace) {
  const presetIds = [...new Set(cueSounds.map((cs) => cs.preset_id).filter((p) => p != null))];
  if (presetIds.length) {
    const found = await client.query(
      'SELECT id FROM audio_presets WHERE id = ANY($1) AND is_active = TRUE',
      [presetIds]
    );
    const okIds = new Set(found.rows.map((r) => r.id));
    const bad = presetIds.find((p) => !okIds.has(p));
    if (bad !== undefined) return { ok: false, error: `Пресет ${bad} не найден или неактивен` };
  }
  if (replace) {
    await client.query('DELETE FROM complex_cue_sounds WHERE complex_id = $1', [complexId]);
  }
  for (const cs of cueSounds) {
    await client.query(
      `INSERT INTO complex_cue_sounds (complex_id, cue_name, preset_id, is_locked)
       VALUES ($1, $2, $3, $4)`,
      [complexId, cs.cue_name, cs.preset_id ?? null, !!cs.is_locked]
    );
  }
  return { ok: true };
}

// Создать новый комплекс для пациента
router.post('/', authenticateToken, async (req, res) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    const {
      patient_id,
      title,
      diagnosis_id,
      diagnosis_note,
      recommendations,
      warnings,
      exercises,
      cue_sounds
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

    // AA3: структурная валидация cue_sounds (если передан).
    const cueValid = validateCueSoundsStructure(cue_sounds);
    if (!cueValid.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Validation Error', message: cueValid.error });
    }

    // Доступ к пациенту: админ — любой; инструктор — свой/назначенный (FOR UPDATE
    // предотвращает race condition при параллельном создании).
    const patientCheck = await client.query(
      `SELECT id FROM patients WHERE id = $1 AND ($3 = 'admin' OR created_by = $2 OR assigned_instructor_id = $2) FOR UPDATE`,
      [patient_id, req.user.id, req.user.role]
    );

    if (patientCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Нет доступа к этому пациенту'
      });
    }

    // EA3: валидация трек-пресетов привязки упражнений (kind='track', активен).
    const audioCheck = await validateTrackPresetIds(
      (sql, params) => client.query(sql, params),
      exercises.map((ex) => normalizeExerciseAudio(ex).audioPresetId)
    );
    if (!audioCheck.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Validation Error', message: audioCheck.error });
    }

    // Создаем комплекс (access_token больше не генерируется — пациент получает
    // доступ только через личный кабинет, см. миграцию 20260409_complexes_access_token_nullable.sql)
    // title опционален: NULL → derived_title fallback из первых 2 упражнений (Wave 1 #1.08a)
    const normalizedTitle = (typeof title === 'string' && title.trim()) || null;
    const complexResult = await client.query(
      `INSERT INTO complexes
       (patient_id, instructor_id, title, diagnosis_id, diagnosis_note, recommendations, warnings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [patient_id, req.user.id, normalizedTitle, diagnosis_id, diagnosis_note, recommendations, warnings]
    );

    const complex = complexResult.rows[0];

    // Wave 3 C1: автозаполнение ответственного инструктора пациента.
    // Только если пациент ещё без ответственного — не перезаписываем существующее
    // назначение (вторым комплексом другого инструктора и т.п.).
    // В той же транзакции (client.query), иначе UPDATE может пройти при ROLLBACK INSERT'а.
    await client.query(
      `UPDATE patients
          SET assigned_instructor_id = $1, updated_at = NOW()
        WHERE id = $2 AND assigned_instructor_id IS NULL`,
      [req.user.id, patient_id]
    );

    // Добавляем упражнения в комплекс
    for (const exercise of exercises) {
      const fields = normalizeExerciseFields(exercise);
      const audio = normalizeExerciseAudio(exercise); // EA3: per-row звук
      await client.query(
        `INSERT INTO complex_exercises
         (complex_id, exercise_id, order_number, sets, reps, duration_seconds, rest_seconds, notes,
          auto_complete, tempo_eccentric_s, tempo_pause_s, tempo_concentric_s,
          audio_preset_id, audio_loop, audio_off)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          complex.id,
          exercise.exercise_id,
          exercise.order_number,
          fields.sets,
          fields.reps,
          fields.durationSeconds,
          fields.restSeconds,
          exercise.notes,
          fields.autoComplete,
          fields.tempoEccentric,
          fields.tempoPause,
          fields.tempoConcentric,
          audio.audioPresetId,
          audio.audioLoop,
          audio.audioOff,
        ]
      );
    }

    // AA3: привязка звуков к cue'ам (если передана непустая). Отсутствие cue в
    // массиве = наследовать дом-карту; preset_id=null = «явный тон».
    if (Array.isArray(cue_sounds) && cue_sounds.length > 0) {
      const applied = await applyCueSoundBindings(client, complex.id, cue_sounds, false);
      if (!applied.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Validation Error', message: applied.error });
      }
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
                  -- CP2c: instructor read round-trip (TZ_..._CP2c_INSTRUCTOR_READ).
                  -- CP2a добавил эти поля только пациентскому /my-complexes/:id
                  -- (зеркало patientAuth.js:1482-1485). Без них EditComplex
                  -- читал undefined → молча затирал auto_complete=false и темп.
                  'auto_complete', ce.auto_complete,
                  'tempo_eccentric_s', ce.tempo_eccentric_s,
                  'tempo_pause_s', ce.tempo_pause_s,
                  'tempo_concentric_s', ce.tempo_concentric_s,
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
      data: fullComplexResult.rows[0],
      message: 'Комплекс успешно создан'
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
              COUNT(DISTINCT pl.id) FILTER (WHERE pl.completed = true) as completions_count,
              -- Wave 1 #1.08a: derived_title для UI fallback (Bug #13).
              -- Если title есть и непустой — он. Иначе первые 2 упражнения joined ' · '.
              -- Если ни того, ни другого — NULL (фронт сам показывает «Комплекс #N»).
              COALESCE(
                NULLIF(c.title, ''),
                (
                  SELECT string_agg(ex.title, ' · ' ORDER BY sub.order_number)
                  FROM (
                    SELECT ce2.exercise_id, ce2.order_number
                    FROM complex_exercises ce2
                    WHERE ce2.complex_id = c.id
                    ORDER BY ce2.order_number
                    LIMIT 2
                  ) sub
                  JOIN exercises ex ON ex.id = sub.exercise_id
                )
              ) AS derived_title
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
      data: result.rows,
      total: result.rows.length
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
              COUNT(DISTINCT ce.id) as exercises_count,
              COALESCE(
                NULLIF(c.title, ''),
                (
                  SELECT string_agg(ex.title, ' · ' ORDER BY sub.order_number)
                  FROM (
                    SELECT ce2.exercise_id, ce2.order_number
                    FROM complex_exercises ce2
                    WHERE ce2.complex_id = c.id
                    ORDER BY ce2.order_number
                    LIMIT 2
                  ) sub
                  JOIN exercises ex ON ex.id = sub.exercise_id
                )
              ) AS derived_title
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
      data: result.rows,
      total: result.rows.length
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
      data: { complexId: id, exercises: result.rows }
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
              COALESCE(
                NULLIF(c.title, ''),
                (
                  SELECT string_agg(ex.title, ' · ' ORDER BY sub.order_number)
                  FROM (
                    SELECT ce2.exercise_id, ce2.order_number
                    FROM complex_exercises ce2
                    WHERE ce2.complex_id = c.id
                    ORDER BY ce2.order_number
                    LIMIT 2
                  ) sub
                  JOIN exercises ex ON ex.id = sub.exercise_id
                )
              ) AS derived_title,
              -- AA3/AA4: raw cue-привязки звуков комплекса для pre-fill секции
              -- «Звуки комплекса» в EditComplex. Скалярный подзапрос (не задет GROUP BY).
              -- preset_name/preset_is_active — для отображения уже выбранного (в т.ч.
              -- ставшего неактивным) пресета; resolution в раннер — отдельно (audio_cues
              -- в /my-complexes/:id). Отсутствие строки cue = наследование дом-карты.
              (
                SELECT COALESCE(json_agg(json_build_object(
                  'cue_name', ccs.cue_name,
                  'preset_id', ccs.preset_id,
                  'is_locked', ccs.is_locked,
                  'preset_name', ap.name,
                  'preset_is_active', ap.is_active
                ) ORDER BY ccs.cue_name), '[]'::json)
                FROM complex_cue_sounds ccs
                LEFT JOIN audio_presets ap ON ap.id = ccs.preset_id
                WHERE ccs.complex_id = c.id
              ) AS cue_sounds,
              json_agg(
                json_build_object(
                  'id', ce.id,
                  'order_number', ce.order_number,
                  'sets', ce.sets,
                  'reps', ce.reps,
                  'duration_seconds', ce.duration_seconds,
                  'rest_seconds', ce.rest_seconds,
                  'notes', ce.notes,
                  -- CP2c: instructor edit round-trip (питает EditComplex.loadComplexData).
                  'auto_complete', ce.auto_complete,
                  'tempo_eccentric_s', ce.tempo_eccentric_s,
                  'tempo_pause_s', ce.tempo_pause_s,
                  'tempo_concentric_s', ce.tempo_concentric_s,
                  -- EA3/EA4: raw звук упражнения для pre-fill контрола в EditComplex.
                  -- audio_preset_id/loop/off — per-комплекс привязка; lib_* — дефолт
                  -- библиотеки (для метки «наследовать (из библиотеки: …)»). Резолв в
                  -- раннер — отдельно (exercise.audio в /my-complexes/:id).
                  'audio_preset_id', ce.audio_preset_id,
                  'audio_loop', ce.audio_loop,
                  'audio_off', ce.audio_off,
                  'lib_audio_preset_id', e.audio_preset_id,
                  'lib_audio_loop', e.audio_loop,
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
      data: result.rows[0]
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
    const { title, diagnosis_id, recommendations, warnings, exercises, cue_sounds } = req.body;

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

    // Guard: exercises обязателен и непуст (как в POST). Без него пустой/отсутствующий
    // массив прошёл бы DELETE ниже (стёр все упражнения), а цикл вставки ничего бы не
    // добавил — комплекс остался бы пустым (потеря данных) либо TypeError на undefined.
    if (!exercises || !Array.isArray(exercises) || exercises.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Список упражнений обязателен'
      });
    }

    // AA3: структурная валидация cue_sounds (если передан).
    const cueValid = validateCueSoundsStructure(cue_sounds);
    if (!cueValid.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Validation Error', message: cueValid.error });
    }

    // EA3: валидация трек-пресетов привязки упражнений (kind='track', активен).
    const audioCheck = await validateTrackPresetIds(
      (sql, params) => client.query(sql, params),
      (exercises || []).map((ex) => normalizeExerciseAudio(ex).audioPresetId)
    );
    if (!audioCheck.ok) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Validation Error', message: audioCheck.error });
    }

    // Обновляем комплекс. title опционален — пустая строка → NULL → derived_title fallback.
    const normalizedTitle = (typeof title === 'string' && title.trim()) || null;
    await client.query(
      `UPDATE complexes SET
         title = $1,
         diagnosis_id = $2,
         recommendations = $3,
         warnings = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [normalizedTitle, diagnosis_id, recommendations, warnings, id]
    );

    // Удаляем старые упражнения
    await client.query(
      'DELETE FROM complex_exercises WHERE complex_id = $1',
      [id]
    );

    // Добавляем новые упражнения
    for (const exercise of exercises) {
      const fields = normalizeExerciseFields(exercise);
      const audio = normalizeExerciseAudio(exercise); // EA3: per-row звук
      await client.query(
        `INSERT INTO complex_exercises
         (complex_id, exercise_id, order_number, sets, reps, duration_seconds, rest_seconds, notes,
          auto_complete, tempo_eccentric_s, tempo_pause_s, tempo_concentric_s,
          audio_preset_id, audio_loop, audio_off)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id,
          exercise.exercise_id,
          exercise.order_number,
          fields.sets,
          fields.reps,
          fields.durationSeconds,
          fields.restSeconds,
          exercise.notes,
          fields.autoComplete,
          fields.tempoEccentric,
          fields.tempoPause,
          fields.tempoConcentric,
          audio.audioPresetId,
          audio.audioLoop,
          audio.audioOff,
        ]
      );
    }

    // AA3: replace привязок звуков (если cue_sounds передан — даже [] → очистка → наследование).
    if (cue_sounds !== undefined) {
      const applied = await applyCueSoundBindings(client, id, cue_sounds, true);
      if (!applied.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Validation Error', message: applied.error });
      }
    }

    await client.query('COMMIT');

    res.json({
      data: { complex_id: id },
      message: 'Комплекс успешно обновлён'
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

    // Доступ к пациенту: админ — любой; инструктор — свои (created_by) ИЛИ назначенные
    // (assigned_instructor_id). Гард на IDOR, заменяет неявный instructor-фильтр ниже.
    const access = await query(
      `SELECT 1 FROM patients
        WHERE id = $1
          AND ($3 = 'admin' OR created_by = $2 OR assigned_instructor_id = $2)`,
      [patient_id, req.user.id, req.user.role]
    );
    if (access.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Пациент не найден' });
    }

    // ВСЕ активные комплексы ПАЦИЕНТА (НЕ только текущего инструктора). Раньше фильтр
    // `c.instructor_id = $2` прятал комплексы, созданные другим инструктором (напр. после
    // переназначения пациента — Wave 3): редактор программы/блоков их не видел, а селектор
    // в legacy/BlockEditor показывал «— Выберите комплекс —» и при сейве терял день.
    // Принадлежность комплекса = patient_id (как валидирует AC2 allComplexesAllowed).
    const result = await query(
      `SELECT c.*,
              d.name as diagnosis_name,
              COUNT(ce.id) as exercises_count,
              COALESCE(
                NULLIF(c.title, ''),
                (
                  SELECT string_agg(ex.title, ' · ' ORDER BY sub.order_number)
                  FROM (
                    SELECT ce2.exercise_id, ce2.order_number
                    FROM complex_exercises ce2
                    WHERE ce2.complex_id = c.id
                    ORDER BY ce2.order_number
                    LIMIT 2
                  ) sub
                  JOIN exercises ex ON ex.id = sub.exercise_id
                )
              ) AS derived_title
       FROM complexes c
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN complex_exercises ce ON c.id = ce.complex_id
       WHERE c.patient_id = $1 AND c.is_active = true
       GROUP BY c.id, d.name
       ORDER BY c.created_at DESC`,
      [patient_id]
    );

    res.json({
      data: result.rows,
      total: result.rows.length
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
      data: { id: result.rows[0].id },
      message: 'Комплекс успешно удален'
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
      data: { id: result.rows[0].id },
      message: 'Комплекс успешно восстановлен'
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
      data: { id: parseInt(id) },
      message: 'Комплекс удалён навсегда'
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

