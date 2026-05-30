// =====================================================
// UTILS: валидация загружаемых звуков (Custom Audio CA2)
//
// Named pure helpers (Rule #37) — тестируются как чистые функции без HTTP.
// Magic-byte детект: НЕ доверяем расширению/mime (их подделать тривиально),
// определяем тип по сигнатуре файла. Принимаем только MP3 и WAV (decision #2:
// оба декодятся decodeAudioData на iOS; OGG/Opus отвалится на iOS Safari).
// =====================================================

// Whitelist cue'ов — ЗЕРКАЛО CHECK в миграции 20260530_patient_audio_overrides.
// tempo_tick включён forward-compat (CP3b отложен, но в каталоге).
const AUDIO_CUE_NAMES = ['count_tick', 'set_start', 'set_end', 'rest_end', 'tempo_tick'];

// Канонические mime + ext по ДЕТЕКТИРОВАННОМУ типу. Храним и отдаём именно
// их (не client-mime/ext) — авторитетный источник.
const AUDIO_TYPE_META = {
  mp3: { mime: 'audio/mpeg', ext: 'mp3' },
  wav: { mime: 'audio/wav', ext: 'wav' },
};

/**
 * Детект типа аудио по magic-bytes.
 *   MP3 — тег 'ID3' (ID3v2) ИЛИ MPEG frame-sync (байт0=0xFF, верхние 3 бита
 *         байта1 = 111, т.е. (b1 & 0xE0) === 0xE0 — покрывает FF FB/F3/F2/FA…).
 *   WAV — RIFF-контейнер: 'RIFF' (байты 0..3) + 'WAVE' (байты 8..11).
 * @param {Buffer} buffer
 * @returns {'mp3'|'wav'|null}
 */
function detectAudioType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // MP3: ID3v2 tag ('ID3')
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return 'mp3';
  // MP3: MPEG audio frame sync (11 выставленных бит)
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'mp3';

  // WAV: 'RIFF' .... 'WAVE'
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && // RIFF
    buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45 // WAVE
  ) {
    return 'wav';
  }

  return null;
}

/** Валиден ли cue_name (в каталоге CP1). */
function isValidCueName(name) {
  return typeof name === 'string' && AUDIO_CUE_NAMES.includes(name);
}

module.exports = { AUDIO_CUE_NAMES, AUDIO_TYPE_META, detectAudioType, isValidCueName };
