// services/structuringLlm.js — LLM-клиент для структурирования надиктовки упражнений.
//
// Провайдер-агностичный (оба OpenAI-совместимы), выбор через config.structureLlmProvider:
//   'deepseek' (по умолчанию) — DeepSeek API (deepseek-v4-flash), качественнее;
//   'isai'                    — is*ai (is*hosting, бесплатные Ollama-модели) — fallback.
//
// ⚠️ ТОЛЬКО НЕ-PII: сюда уходит контент библиотеки упражнений, НЕ данные пациентов.

'use strict';

const config = require('../config/config');
const {
  buildStructuringPrompt,
  normalizeStructuredExercise,
} = require('../utils/exerciseStructuring');

// Активный провайдер → { provider, baseUrl, apiKey, model }.
function resolveProvider() {
  const provider = config.structureLlmProvider === 'isai' ? 'isai' : 'deepseek';
  const c = provider === 'isai' ? config.isai : config.deepseek;
  return { provider, baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.model };
}

function isConfigured() {
  return Boolean(resolveProvider().apiKey);
}

function endpointUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
}

// Низкоуровневый OpenAI-совместимый вызов. Возвращает строку content первого choice.
async function chatCompletion(messages, { timeoutMs = 90000, temperature = 0.2 } = {}) {
  const { provider, baseUrl, apiKey, model } = resolveProvider();
  if (!apiKey) {
    const e = new Error(`LLM не сконфигурирован (провайдер ${provider})`);
    e.code = 'LLM_NOT_CONFIGURED';
    throw e;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { model, messages, temperature, stream: false };
    // DeepSeek: гарантированный валидный JSON (нативной json_schema нет, есть json_object).
    // Требует слова "json" в промпте — оно есть в системном промпте структурирования.
    if (provider === 'deepseek') {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(endpointUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const e = new Error(`LLM HTTP ${res.status}`);
      e.code = 'LLM_HTTP';
      e.status = res.status;
      e.body = text.slice(0, 300);
      throw e;
    }

    const data = await res.json();
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== 'string' || !content.trim()) {
      const e = new Error('LLM вернул пустой ответ');
      e.code = 'LLM_EMPTY';
      throw e;
    }
    return content;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('LLM: таймаут запроса');
      e.code = 'LLM_TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Высокоуровневое: расшифровка надиктовки → { fields, warnings, raw, provider }.
async function structureExercise(transcript) {
  const { system, user } = buildStructuringPrompt(transcript);
  const raw = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
  const { fields, warnings } = normalizeStructuredExercise(raw);
  return { fields, warnings, raw, provider: resolveProvider().provider };
}

module.exports = { isConfigured, chatCompletion, structureExercise, resolveProvider };
