// services/yandexSpeechKit.js — клиент Yandex SpeechKit STT (short audio recognize).
//
// Распознавание надиктовки упражнений (НЕ-PII контент библиотеки). Каталог
// cloud-jaike077 (РФ). Аутентификация — API-ключ сервисного аккаунта (Api-Key header).
//
// Short audio recognize: до ~30с / 1 МБ на запрос. Форматы: oggopus | lpcm | mp3.
// Для lpcm нужен sampleRateHertz (raw PCM 16-bit LE, БЕЗ WAV-заголовка).
// Док: https://yandex.cloud/ru/docs/speechkit/stt/api/request-api

'use strict';

const config = require('../config/config');

const STT_URL = 'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize';
const ALLOWED_FORMATS = ['oggopus', 'lpcm', 'mp3'];

function isConfigured() {
  return Boolean(config.speechkit.apiKey && config.speechkit.folderId);
}

// Распознать аудио-буфер → строка текста (или '' если ничего не распознано).
async function transcribe(audioBuffer, { format = 'oggopus', sampleRateHertz, lang } = {}) {
  if (!isConfigured()) {
    const e = new Error('SpeechKit не сконфигурирован (нет ключа/folderId)');
    e.code = 'STT_NOT_CONFIGURED';
    throw e;
  }
  if (!audioBuffer || !audioBuffer.length) {
    const e = new Error('Пустое аудио');
    e.code = 'STT_EMPTY_AUDIO';
    throw e;
  }
  const fmt = ALLOWED_FORMATS.includes(format) ? format : 'oggopus';

  const params = new URLSearchParams({
    folderId: config.speechkit.folderId,
    lang: lang || config.speechkit.lang || 'ru-RU',
    format: fmt,
  });
  if (fmt === 'lpcm' && sampleRateHertz != null) {
    params.set('sampleRateHertz', String(sampleRateHertz));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${STT_URL}?${params.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Api-Key ${config.speechkit.apiKey}` },
      body: audioBuffer,
      signal: controller.signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      const e = new Error(`SpeechKit HTTP ${res.status}`);
      e.code = 'STT_HTTP';
      e.status = res.status;
      e.body = raw.slice(0, 300);
      throw e;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      const e = new Error('SpeechKit: невалидный JSON в ответе');
      e.code = 'STT_BAD_RESPONSE';
      throw e;
    }
    return data && typeof data.result === 'string' ? data.result : '';
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('SpeechKit: таймаут запроса');
      e.code = 'STT_TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isConfigured, transcribe, ALLOWED_FORMATS };
