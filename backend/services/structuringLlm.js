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
  buildScriptPlannerPrompt,
  buildReviewPrompt,
  buildFixPrompt,
  summarizeReview,
  buildSanityPrompt,
  summarizeSanity,
  buildCompletenessPrompt,
  buildConsistencyPrompt,
  parseModelJson,
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
async function chatCompletion(messages, { timeoutMs = 90000, temperature = 0.2, model: modelOverride } = {}) {
  const { provider, baseUrl, apiKey, model } = resolveProvider();
  if (!apiKey) {
    const e = new Error(`LLM не сконфигурирован (провайдер ${provider})`);
    e.code = 'LLM_NOT_CONFIGURED';
    throw e;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { model: modelOverride || model, messages, temperature, stream: false };
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

// Ревью качества: модель видит исходную расшифровку + извлечённые поля и оценивает
// faithfulness/safety/clarity/completeness/language. Возвращает нормализованный
// объект summarizeReview (веса и pass считаются в коде). temperature низкая.
async function reviewStructured(fields, rawText) {
  const { system, user } = buildReviewPrompt(fields, rawText);
  const raw = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: 0.1 });
  return summarizeReview(raw);
}

// Клинический sanity-check: оценивает безопасность/правдоподобность САМОГО
// содержания (не верность источнику). Возвращает summarizeSanity { concerns }.
// Только советы — поля не меняет.
async function clinicalSanityCheck(fields) {
  const { system, user } = buildSanityPrompt(fields);
  const raw = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: 0.1 });
  return summarizeSanity(raw);
}

// Критик полноты (агент №5): целостность описания для пациента. Тот же {concerns}.
async function completenessCheck(fields) {
  const { system, user } = buildCompletenessPrompt(fields);
  const raw = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: 0.1 });
  return summarizeSanity(raw);
}

// Критик консистентности (агент №6): единообразие/стиль. Тот же {concerns}.
async function consistencyCheck(fields) {
  const { system, user } = buildConsistencyPrompt(fields);
  const raw = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: 0.1 });
  return summarizeSanity(raw);
}

// Один автофикс по замечаниям рецензента → перенормализованные поля.
async function fixStructured(fields, rawText, issues) {
  const { system, user } = buildFixPrompt(fields, rawText, issues);
  const raw = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: 0.2 });
  return normalizeStructuredExercise(raw);
}

// Высокоуровневое: расшифровка надиктовки → { fields, warnings, raw, provider, review?, fixed? }.
// opts.review=true → дополнительный цикл: review → при pass=false один fix → re-review
// (показанная оценка отражает финальную версию полей). Ревью best-effort: его сбой не
// валит разбор — отдаём fields + review:null + warning.
async function structureExercise(transcript, opts = {}) {
  const { system, user } = buildStructuringPrompt(transcript);
  const raw = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
  let { fields, warnings } = normalizeStructuredExercise(raw);
  const result = { fields, warnings, raw, provider: resolveProvider().provider };

  if (!opts.review) return result;

  try {
    let review = await reviewStructured(fields, transcript);
    let fixed = false;
    if (review.ok && !review.pass) {
      const fix = await fixStructured(fields, transcript, review.issues);
      if (fix && fix.fields && Object.keys(fix.fields).length) {
        fields = fix.fields;
        warnings = fix.warnings;
        fixed = true;
        review = await reviewStructured(fields, transcript); // re-review финальной версии
      }
    }
    result.fields = fields;
    result.warnings = warnings;
    result.review = review.ok ? review : null;
    result.fixed = fixed;
    if (!review.ok) warnings.push('Проверка качества недоступна (некорректный ответ рецензента)');

    // Три advisory-критика финальной версии ПАРАЛЛЕЛЬНО (клин. sanity + полнота №5 +
    // консистентность №6) — независимы, читают финальные поля. Best-effort: сбой одного
    // не валит остальные и не валит разбор. Латентность ≈ один вызов, а не три.
    const [sanityR, complR, consR] = await Promise.allSettled([
      clinicalSanityCheck(fields),
      completenessCheck(fields),
      consistencyCheck(fields),
    ]);
    const pick = (r) => (r.status === 'fulfilled' && r.value && r.value.ok ? r.value.concerns : null);
    result.sanity = pick(sanityR);
    result.completeness = pick(complR);
    result.consistency = pick(consR);
  } catch (err) {
    // Ревью — необязательный слой; разбор не валим.
    result.review = null;
    result.warnings.push('Проверка качества недоступна (ошибка AI-рецензента)');
  }

  return result;
}

// Планировщик скрипта (этап 4): черновой ввод → { script, review_points }. Генерация
// на сильной модели (deepseek-v4-pro для провайдера deepseek; для isai — дефолтная).
// best-effort парсинг JSON; пустой script → ошибка (роут отдаст 502).
async function planExerciseScript(input) {
  const { system, user } = buildScriptPlannerPrompt(input);
  const provider = resolveProvider().provider;
  const modelOverride = provider === 'deepseek' ? config.deepseek.modelPro : undefined;
  const raw = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: 0.4, model: modelOverride });

  const parsed = parseModelJson(raw);
  const script = parsed && typeof parsed.script === 'string' ? parsed.script.trim() : '';
  const reviewPoints = parsed && Array.isArray(parsed.review_points)
    ? parsed.review_points.map((p) => String(p == null ? '' : p).trim()).filter(Boolean).slice(0, 20)
    : [];
  if (!script) {
    const e = new Error('Планировщик вернул пустой скрипт');
    e.code = 'LLM_EMPTY';
    throw e;
  }
  return { script, review_points: reviewPoints, provider };
}

module.exports = {
  isConfigured,
  chatCompletion,
  structureExercise,
  planExerciseScript,
  reviewStructured,
  fixStructured,
  clinicalSanityCheck,
  completenessCheck,
  consistencyCheck,
  resolveProvider,
};
