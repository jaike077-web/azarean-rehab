// =====================================================
// UTILS: Exercise Audio (EA3) — резолв и валидация ДЛИННОГО звука упражнения.
//
// Звук (музыка/голос/медитация) привязан к упражнению на ДВУХ уровнях:
//   exercises.audio_preset_id           — дефолт библиотеки;
//   complex_exercises.audio_preset_id   — перебить в комплексе;
//   complex_exercises.audio_off=true    — явно выключить здесь.
//
// Резолв-приоритет (зеркало AA3 cue-резолва):
//   1) complex_exercises.audio_off=true            → нет звука;
//   2) complex_exercises.audio_preset_id IS NOT NULL → этот пресет + его loop
//      (если пресет неактивен / не kind='track' → нет звука, НЕ падаем на библиотеку);
//   3) exercises.audio_preset_id IS NOT NULL         → дефолт библиотеки + его loop
//      (неактивен/не track → нет звука);
//   4) иначе                                          → нет звука.
// Только активные kind='track' пресеты играют — иначе безопасная деградация в «нет звука».
// sig = updated_at пресета (раннер EA5 инвалидирует кэш-буфер при смене sig).
// =====================================================

// SQL-фрагмент: резолвнутый audio-объект упражнения (json|null) внутри
// json_build_object. ТРЕБУЕТ в scope запроса алиасы:
//   ce    — complex_exercises
//   e     — exercises
//   ap_ce — LEFT JOIN audio_presets ON ap_ce.id = ce.audio_preset_id
//   ap_e  — LEFT JOIN audio_presets ON ap_e.id  = e.audio_preset_id
// Любой запрос, инжектящий этот фрагмент, ОБЯЗАН добавить EXERCISE_AUDIO_JOINS
// (иначе SQL упадёт на отсутствующих ap_ce/ap_e — ошибка видна сразу, не молча).
const RESOLVED_EXERCISE_AUDIO_SQL = `
        CASE
          WHEN ce.audio_off THEN NULL
          WHEN ce.audio_preset_id IS NOT NULL THEN
            CASE WHEN ap_ce.is_active AND ap_ce.kind = 'track'
              THEN json_build_object('preset_id', ce.audio_preset_id, 'loop', ce.audio_loop, 'sig', ap_ce.updated_at)
              ELSE NULL END
          WHEN e.audio_preset_id IS NOT NULL THEN
            CASE WHEN ap_e.is_active AND ap_e.kind = 'track'
              THEN json_build_object('preset_id', e.audio_preset_id, 'loop', e.audio_loop, 'sig', ap_e.updated_at)
              ELSE NULL END
          ELSE NULL
        END`;

// LEFT JOIN'ы для RESOLVED_EXERCISE_AUDIO_SQL. Инжектить ПОСЛЕ `LEFT JOIN exercises e`.
const EXERCISE_AUDIO_JOINS = `
       LEFT JOIN audio_presets ap_ce ON ap_ce.id = ce.audio_preset_id
       LEFT JOIN audio_presets ap_e  ON ap_e.id  = e.audio_preset_id`;

/**
 * Нормализация audio-полей одной строки упражнения (write-path complexes.js).
 * audio_off=true жёстко обнуляет preset_id+loop (бэкстоп DB CHECK'ов
 * chk_ce_audio_off_no_preset / chk_ce_audio_off_no_loop). loop осмыслен только
 * при заданном preset_id.
 * @returns {{audioPresetId:number|null, audioLoop:boolean, audioOff:boolean}}
 */
function normalizeExerciseAudio(exercise) {
  const off = exercise.audio_off === true || exercise.audio_off === 'true';
  if (off) return { audioPresetId: null, audioLoop: false, audioOff: true };
  const raw = exercise.audio_preset_id;
  const n = Number(raw);
  const audioPresetId = raw != null && Number.isInteger(n) && n > 0 ? n : null;
  const audioLoop =
    audioPresetId != null && (exercise.audio_loop === true || exercise.audio_loop === 'true');
  return { audioPresetId, audioLoop, audioOff: false };
}

/**
 * Валидация набора preset id для exercise-привязки: каждый должен существовать,
 * быть активным И kind='track'. Пустой набор → ok. Один плохой → ok:false.
 * @param {Function} query — db.query
 * @param {Array<number|null>} ids
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function validateTrackPresetIds(query, ids) {
  const unique = [...new Set((ids || []).filter((p) => p != null))];
  if (unique.length === 0) return { ok: true };
  const found = await query(
    "SELECT id FROM audio_presets WHERE id = ANY($1) AND is_active = TRUE AND kind = 'track'",
    [unique]
  );
  const okIds = new Set(found.rows.map((r) => r.id));
  const bad = unique.find((p) => !okIds.has(p));
  if (bad !== undefined) {
    return { ok: false, error: `Аудио-пресет ${bad} не найден, неактивен или не является треком` };
  }
  return { ok: true };
}

module.exports = {
  RESOLVED_EXERCISE_AUDIO_SQL,
  EXERCISE_AUDIO_JOINS,
  normalizeExerciseAudio,
  validateTrackPresetIds,
};
