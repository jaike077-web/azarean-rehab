// =====================================================
// validateAudioFile — клиентская валидация загружаемого звука (CA3)
//
// Named pure helper (Rule #37). Проверки:
//   - расширение .mp3/.wav + mime (если задан браузером);
//   - размер ≤ 512 КБ (524288 б) — decision #4;
//   - длительность ≤ 10 сек — клиентский чек (Vadim 2026-05-30: 5→10, чтобы
//     влезала короткая голосовая фраза, не только бип).
// Длительность измеряется через <audio>.duration (probeDuration инъектируется
// для тестов — Rule #37). probe-fail НЕ блокирует: серверный лимит размера —
// жёсткий бэкстоп, длительность best-effort.
// =====================================================

export const MAX_AUDIO_BYTES = 524288; // 512 КБ
export const MAX_AUDIO_DURATION_S = 10;
const ALLOWED_EXT = ['mp3', 'wav'];
const ALLOWED_MIME = [
  'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
];

// Синхронные проверки (ext/mime/size) — отдельно для прямого тестирования.
export function checkAudioBasics(file) {
  if (!file) return { ok: false, error: 'Файл не выбран' };
  const name = typeof file.name === 'string' ? file.name : '';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (!ALLOWED_EXT.includes(ext)) {
    return { ok: false, error: 'Только MP3 или WAV' };
  }
  if (file.type && !ALLOWED_MIME.includes(file.type)) {
    return { ok: false, error: 'Только MP3 или WAV' };
  }
  if (typeof file.size === 'number' && file.size > MAX_AUDIO_BYTES) {
    return { ok: false, error: 'Файл больше 512 КБ' };
  }
  return { ok: true };
}

// Дефолтный probe длительности через метаданные <audio> (не воспроизводит —
// жеста не требует). Resolve → секунды, reject → не смогли измерить.
function probeDurationViaAudioEl(file) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = URL.createObjectURL(file);
    } catch (e) {
      reject(e);
      return;
    }
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const finish = (fn, val) => {
      try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
      fn(val);
    };
    audio.onloadedmetadata = () => finish(resolve, audio.duration);
    audio.onerror = () => finish(reject, new Error('metadata load failed'));
    audio.src = url;
  });
}

export default async function validateAudioFile(file, probeDuration = probeDurationViaAudioEl) {
  const basics = checkAudioBasics(file);
  if (!basics.ok) return basics;

  let duration;
  try {
    duration = await probeDuration(file);
  } catch (_) {
    // Не смогли измерить (формат/браузер) → не блокируем (серверный лимит
    // размера — жёсткий бэкстоп).
    return { ok: true };
  }
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > MAX_AUDIO_DURATION_S) {
    return { ok: false, error: 'Звук длиннее 10 секунд' };
  }
  return { ok: true };
}
