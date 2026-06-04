// services/isai.js — клиент is*ai (LLM хостера is*hosting, OpenAI-совместимый).
//
// ⚠️ Только НЕ-PII задачи. Данные пациентов сюда НЕ отправляем (is*ai вне РФ, Гонконг).
// Сейчас единственный потребитель — структурирование надиктовки упражнений (не PII).
//
// Эмпирическая неопределённость (research 2026-06-03): точный путь OpenAI-совместимого
// эндпоинта у is*ai не опубликован (`/api/chat/completions` vs `/api/v1/chat/completions`).
// Поэтому baseUrl и model вынесены в env — при подтверждении правим .env, не код.

'use strict';

const config = require('../config/config');
const {
  buildStructuringPrompt,
  normalizeStructuredExercise,
} = require('../utils/exerciseStructuring');

function isConfigured() {
  return Boolean(config.isai.apiKey);
}

function endpointUrl() {
  return `${String(config.isai.baseUrl).replace(/\/+$/, '')}/chat/completions`;
}

// Низкоуровневый вызов chat-completions. Возвращает строку content первого choice.
// Таймаут 90с: is*ai на Ollama грузит модель в память при первом (холодном) запросе —
// это может занять 20-50с; на общем инстансе под нагрузкой ещё дольше (замер gemma3 ~51с).
async function chatCompletion(messages, { timeoutMs = 90000, temperature = 0.2 } = {}) {
  if (!isConfigured()) {
    const e = new Error('is*ai не сконфигурирован (ISAI_API_KEY пуст)');
    e.code = 'ISAI_NOT_CONFIGURED';
    throw e;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpointUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.isai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.isai.model,
        messages,
        temperature,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const e = new Error(`is*ai HTTP ${res.status}`);
      e.code = 'ISAI_HTTP';
      e.status = res.status;
      e.body = body.slice(0, 500);
      throw e;
    }

    const data = await res.json();
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== 'string' || !content.trim()) {
      const e = new Error('is*ai вернул пустой ответ');
      e.code = 'ISAI_EMPTY';
      throw e;
    }
    return content;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('is*ai: таймаут запроса');
      e.code = 'ISAI_TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Высокоуровневое: расшифровка надиктовки → { fields, warnings, raw }.
// fields — частичный безопасный объект для предзаполнения формы упражнения.
async function structureExercise(transcript) {
  const { system, user } = buildStructuringPrompt(transcript);
  const raw = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
  const { fields, warnings } = normalizeStructuredExercise(raw);
  return { fields, warnings, raw };
}

module.exports = { isConfigured, chatCompletion, structureExercise };
