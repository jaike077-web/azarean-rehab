// =====================================================
// OPS ALERT — уведомления об ошибках в Telegram
// =====================================================
// Параллельный канал к Sentry. Отправляет critical errors в выделенный
// Telegram-бот (@azarean_ops_bot или аналог). Использует обычный
// HTTPS-запрос к api.telegram.org — без библиотеки, без polling.
// Telegram API доступен и с rehab-VDS, и от пациентов в РФ — в отличие
// от sentry.io ingest, который заблокирован для русских IP.
//
// Защита от спама:
// - Дедуп по hash(title + первая строка body) с TTL 10 минут.
//   Один и тот же baseline ошибки = один alert / 10 мин, повторы тихо считаются.
// - Hourly cap: максимум 30 алертов в час. После — drop с одной служебной
//   нотификацией «X алертов подавлено» каждые 10 минут.
//
// Если OPS_BOT_TOKEN или OPS_CHAT_ID не заданы — sendOpsAlert() пишет в
// console.log и выходит (noop для dev/test).
// =====================================================

const config = require('../config/config');

const DEDUP_WINDOW_MS = 10 * 60 * 1000;
const HOURLY_CAP = 30;
const SUPPRESSED_NOTICE_INTERVAL_MS = 10 * 60 * 1000;
const TG_API_TIMEOUT_MS = 5000;

const seenHashes = new Map(); // hash → expiresAt
let hourlyCount = 0;
let hourlyResetAt = Date.now() + 60 * 60 * 1000;
let suppressedCount = 0;
let lastSuppressedNoticeAt = 0;

function hash(str) {
  // Простой 32-битный хэш, нам не нужна криптография — только дедуп.
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function pruneExpired() {
  const now = Date.now();
  for (const [h, expires] of seenHashes) {
    if (now > expires) seenHashes.delete(h);
  }
}

async function postToTelegram(token, chatId, text) {
  // node 20+ имеет нативный fetch + AbortSignal.timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TG_API_TIMEOUT_MS);
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000), // Telegram limit 4096 chars, оставляем запас
        disable_web_page_preview: true,
        // parse_mode НЕ используем — произвольный текст из stack trace
        // может содержать <>& и поломать HTML/Markdown parsing.
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[ops-alert] Telegram API ${r.status}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ops-alert] send failed:', err.message);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Отправить alert в ops-bot.
 * @param {string} title — короткий заголовок (1 строка, попадает в дедуп-ключ)
 * @param {string} [body] — детали (stack trace, контекст). Опционально.
 */
async function sendOpsAlert(title, body = '') {
  const { token, chatId } = config.opsBot;
  if (!token || !chatId) {
    // dev/test — просто в консоль
    // eslint-disable-next-line no-console
    console.log(`[ops-alert dry-run] ${title}\n${body}`);
    return;
  }

  const now = Date.now();

  // hourly counter reset
  if (now > hourlyResetAt) {
    hourlyCount = 0;
    hourlyResetAt = now + 60 * 60 * 1000;
  }

  pruneExpired();

  // dedup — title + первая строка body
  const firstBodyLine = (body || '').split('\n', 1)[0] || '';
  const key = hash(title + '|' + firstBodyLine);
  if (seenHashes.has(key)) {
    suppressedCount++;
    return;
  }

  // hourly cap
  if (hourlyCount >= HOURLY_CAP) {
    suppressedCount++;
    if (now - lastSuppressedNoticeAt > SUPPRESSED_NOTICE_INTERVAL_MS) {
      lastSuppressedNoticeAt = now;
      const notice = `⚠️ ops-alert rate-limit\n\nПодавлено ${suppressedCount} алертов за последний период (cap=${HOURLY_CAP}/час).`;
      // не считаем как отдельный hourly slot, не дедупим
      postToTelegram(token, chatId, notice);
      suppressedCount = 0;
    }
    return;
  }

  seenHashes.set(key, now + DEDUP_WINDOW_MS);
  hourlyCount++;

  const env = config.nodeEnv === 'production' ? 'PROD' : config.nodeEnv.toUpperCase();
  const text = `🚨 [${env}] ${title}\n\n${body}`.trim();
  await postToTelegram(token, chatId, text);
}

// для тестов
function _resetState() {
  seenHashes.clear();
  hourlyCount = 0;
  hourlyResetAt = Date.now() + 60 * 60 * 1000;
  suppressedCount = 0;
  lastSuppressedNoticeAt = 0;
}

module.exports = { sendOpsAlert, _resetState };
