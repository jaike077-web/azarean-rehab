// =====================================================
// Pure-хелперы редактора «Стандартного тона» (CT4) — зеркало backend
// utils/audioTone.js (диапазоны/формы волны). Rule #37: тестируется без браузера.
//
// НЕ импортирует getCueConfig (чтобы остаться чистым модулем без зависимости от
// AudioContext → services/api): дефолтный конфиг cue caller передаёт параметром.
//
// UI редактирует ОДНУ частоту (frequencies[0]). Сохранённый/превьюшный tone_config
// всегда single-frequency: { frequencies:[Гц], durationMs, type }.
// =====================================================

export const TONE_WAVE_TYPES = ['sine', 'square', 'triangle', 'sawtooth'];
export const TONE_WAVE_LABELS = {
  sine: 'Синус (мягкий)',
  square: 'Квадрат (резкий)',
  triangle: 'Треугольник',
  sawtooth: 'Пила (жёсткий)',
};
export const TONE_FREQ_MIN = 20;
export const TONE_FREQ_MAX = 20000;
export const TONE_DURATION_MIN_MS = 20;
export const TONE_DURATION_MAX_MS = 2000;

// Безопасный дефолт если ни tone_config, ни валидный defaultCfg не дали данных.
const FALLBACK = { frequencies: [440], durationMs: 200, type: 'sine' };

function firstValid(cfg) {
  return cfg && Array.isArray(cfg.frequencies) && cfg.frequencies.length > 0 ? cfg : null;
}

// Состояние формы { frequency, durationMs, type } из tone_config (приоритет) или
// дефолта cue (defaultCfg = getCueConfig(cue), передаёт caller). Берём первую частоту.
export function toneFormFromConfig(toneConfig, defaultCfg) {
  const src = firstValid(toneConfig) || firstValid(defaultCfg) || FALLBACK;
  return {
    frequency: src.frequencies[0],
    durationMs: src.durationMs,
    type: TONE_WAVE_TYPES.includes(src.type) ? src.type : 'sine',
  };
}

function clampInt(n, lo, hi, dflt) {
  // Пустое поле / null → дефолт (а не Number('')===0 → клампится до min, что нелогично).
  if (n === '' || n === null || n === undefined) return dflt;
  const x = Number(n);
  if (!Number.isFinite(x)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(x)));
}

// tone_config из формы — clamp в допустимые диапазоны (single-frequency). Один источник
// и для сохранения (setAudioCueDefault), и для live-превью override → недоверенный
// ввод формы (пустое поле = NaN) санитизируется ДО синтеза/записи (никогда не молчит).
export function buildToneConfig(form) {
  const f = form || {};
  return {
    frequencies: [clampInt(f.frequency, TONE_FREQ_MIN, TONE_FREQ_MAX, FALLBACK.frequencies[0])],
    durationMs: clampInt(f.durationMs, TONE_DURATION_MIN_MS, TONE_DURATION_MAX_MS, FALLBACK.durationMs),
    type: TONE_WAVE_TYPES.includes(f.type) ? f.type : 'sine',
  };
}
