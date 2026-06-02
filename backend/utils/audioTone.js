// =====================================================
// UTILS: валидация/нормализация tone_config — редактор «Стандартного тона» (CT2)
//
// Named pure helpers (Rule #37) — тестируются как чистые функции без HTTP/БД.
// tone_config описывает параметры встроенного тона события (cue), когда на cue
// НЕ назначен загруженный пресет (preset_id=NULL = «стандартный тон»).
//
// Scope = Вариант А (глобально, дом-карта audio_cue_defaults.tone_config).
// Форма: { frequencies:[Гц 20..20000], durationMs 20..2000, type ∈ TONE_WAVE_TYPES }.
// gain НЕ редактируем — раннер берёт его из getCueConfig(cue) (frontend CT3).
//
// Фронт (CT4) зеркалит TONE_WAVE_TYPES и диапазоны при построении/валидации формы.
// =====================================================

// Формы волны (зеркало WebAudio OscillatorNode.type, без 'custom').
const TONE_WAVE_TYPES = ['sine', 'square', 'triangle', 'sawtooth'];

// Диапазоны (зеркалятся на фронте — ползунки/инпуты).
const TONE_FREQ_MIN = 20;
const TONE_FREQ_MAX = 20000;
const TONE_DURATION_MIN_MS = 20;
const TONE_DURATION_MAX_MS = 2000;
const TONE_FREQ_MAX_COUNT = 8; // UI шлёт 1 частоту; кап против абьюза огромным массивом

/**
 * Валидирует и нормализует tone_config.
 * @param {*} tc — кандидат (объект из тела запроса).
 * @returns {{ok:true, value:{frequencies:number[],durationMs:number,type:string}} | {ok:false, error:string}}
 *   value содержит РОВНО 3 разрешённых ключа (округлённые числа) — в БД ложится
 *   именно то, что читает раннер, без лишних ключей и дрейфа типов.
 */
function validateToneConfig(tc) {
  if (typeof tc !== 'object' || tc === null || Array.isArray(tc)) {
    return { ok: false, error: 'tone_config должен быть объектом' };
  }
  const { frequencies, durationMs, type } = tc;
  if (!Array.isArray(frequencies) || frequencies.length < 1 || frequencies.length > TONE_FREQ_MAX_COUNT) {
    return { ok: false, error: `frequencies: массив 1..${TONE_FREQ_MAX_COUNT} частот` };
  }
  const freqs = [];
  for (const f of frequencies) {
    const n = Number(f);
    if (!Number.isFinite(n) || n < TONE_FREQ_MIN || n > TONE_FREQ_MAX) {
      return { ok: false, error: `Частота вне диапазона ${TONE_FREQ_MIN}–${TONE_FREQ_MAX} Гц` };
    }
    freqs.push(Math.round(n));
  }
  const dur = Number(durationMs);
  if (!Number.isFinite(dur) || dur < TONE_DURATION_MIN_MS || dur > TONE_DURATION_MAX_MS) {
    return { ok: false, error: `Длительность вне диапазона ${TONE_DURATION_MIN_MS}–${TONE_DURATION_MAX_MS} мс` };
  }
  if (!TONE_WAVE_TYPES.includes(type)) {
    return { ok: false, error: 'Недопустимая форма волны' };
  }
  return { ok: true, value: { frequencies: freqs, durationMs: Math.round(dur), type } };
}

module.exports = {
  TONE_WAVE_TYPES,
  TONE_FREQ_MIN,
  TONE_FREQ_MAX,
  TONE_DURATION_MIN_MS,
  TONE_DURATION_MAX_MS,
  TONE_FREQ_MAX_COUNT,
  validateToneConfig,
};
