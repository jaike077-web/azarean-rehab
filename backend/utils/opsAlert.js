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

// =====================================================
// FORMATTERS — превращают сырые ошибки в читаемые алерты
// =====================================================
// Логика: «что сломалось, где, что делать» в начале, технические
// детали (stack, full URL, raw context) — внизу.

// Какие страницы юзера считаем «значимыми» для контекста алерта.
const PAGE_LABELS = [
  [/\/patient-dashboard/, 'личный кабинет пациента'],
  [/\/patient-login/, 'экран входа пациента'],
  [/\/patient-register/, 'регистрация пациента'],
  [/\/dashboard/, 'кабинет инструктора'],
  [/\/patients/, 'список пациентов'],
  [/\/exercises/, 'библиотека упражнений'],
  [/\/admin/, 'админ-панель'],
];

function describePage(url) {
  if (!url) return null;
  for (const [re, label] of PAGE_LABELS) {
    if (re.test(url)) return label;
  }
  return null;
}

// Парсит UA в короткое «Chrome 144 / Windows»
function describeUA(ua) {
  if (!ua) return null;
  let browser = 'браузер';
  const browserMatches = [
    [/YaBrowser\/(\d+)/, (m) => `Yandex Browser ${m[1]}`],
    [/Edg\/(\d+)/, (m) => `Edge ${m[1]}`],
    [/Chrome\/(\d+)/, (m) => `Chrome ${m[1]}`],
    [/Firefox\/(\d+)/, (m) => `Firefox ${m[1]}`],
    [/Version\/(\d+)[^)]*Safari/, (m) => `Safari ${m[1]}`],
  ];
  for (const [re, fn] of browserMatches) {
    const m = ua.match(re);
    if (m) { browser = fn(m); break; }
  }
  let os = '';
  if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return os ? `${browser} / ${os}` : browser;
}

// Категоризирует frontend-ошибку → возвращает {tag, advice}
function categorizeFrontendError(message, context) {
  const msg = String(message || '').toLowerCase();
  const filename = (context && context.filename) || '';

  // smoke / test → ручная проверка, игнор
  if (/smoke|manual|test/.test(msg) || filename === '<anonymous>') {
    return {
      tag: 'ТЕСТ',
      advice: 'Это ручной smoke-test из консоли — игнор, ничего делать не надо.',
    };
  }
  if (/ChunkLoadError|loading chunk \d+ failed/i.test(message)) {
    return {
      tag: 'СТАРЫЙ БАНДЛ',
      advice: 'У пользователя в браузере зависла старая версия. Если повторяется — нужен hard-refresh (ctrl+shift+R) или PWA-update должен сработать сам через 60 сек после возвращения в app.',
    };
  }
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return {
      tag: 'СВЯЗЬ',
      advice: 'Браузер не достучался до /api. Проверь — backend жив (pm2 status), nginx OK. Если только у одного юзера — у него интернет.',
    };
  }
  if (/cannot read prop|undefined is not|null is not/i.test(message)) {
    return {
      tag: 'БАГ В UI',
      advice: 'Компонент получил неожиданные данные. Смотри stack ниже — обычно где-то нет guard для пустого / null поля.',
    };
  }
  return {
    tag: 'ОШИБКА UI',
    advice: 'Глянь stack ниже. Если это уникальная — может быть случайным сбоем. Если повторяется или у разных юзеров — баг.',
  };
}

// Категоризирует backend-ошибку
function categorizeBackendError(err) {
  const code = err && err.code;
  const msg = String((err && err.message) || '');

  // PostgreSQL коды: 22xxx (data exception), 23xxx (constraint), 42xxx (syntax)
  if (typeof code === 'string' && /^(22|23|42)\d{3}$/.test(code)) {
    return {
      tag: 'БД',
      advice: `PostgreSQL ${code}. ${code.startsWith('22') ? 'Данные не помещаются / неверный формат — баг в схеме или валидации.' : code.startsWith('23') ? 'Нарушено constraint (UNIQUE, NOT NULL, FK) — баг в коде или race condition.' : 'Синтаксическая ошибка SQL — копать недавние правки routes/.'}`,
    };
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      tag: 'СЕРВИС НЕДОСТУПЕН',
      advice: 'Backend не достучался до зависимости (PG / Telegram API / Kinescope / прокси). Проверь pm2 logs, что не упало.',
    };
  }
  if (code === 'ETIMEDOUT' || /timeout/i.test(msg)) {
    return {
      tag: 'ТАЙМАУТ',
      advice: 'Запрос к внешнему сервису не успел. Если повторяется — у сервиса проблемы. Если разово — игнор.',
    };
  }
  if (/jwt|token|unauthorized/i.test(msg)) {
    return {
      tag: 'AUTH',
      advice: 'Проблема с JWT/refresh-токеном. Чаще всего — кривой ENV (JWT_SECRET / PATIENT_JWT_SECRET) или истёкший токен.',
    };
  }
  return {
    tag: 'ОШИБКА БЭКЕНДА',
    advice: 'Глянь stack и pm2 logs. Если 500 первый раз — может быть случайный сбой, ждать. Если повторяется — копать.',
  };
}

// Склейка финального текста для frontend-ошибки.
// payload: { message, stack, url, userAgent, context }
function formatFrontendAlertBody(payload) {
  const { message = '', stack = '', url = '', userAgent = '', context = {} } = payload || {};
  const page = describePage(url);
  const ua = describeUA(userAgent);
  const { tag, advice } = categorizeFrontendError(message, context);

  const lines = [];
  lines.push(`Тип: Frontend · ${tag}`);
  if (page) lines.push(`Где: ${page}`);
  lines.push(`Что: ${message || '(без сообщения)'}`);
  if (ua) lines.push(`Браузер: ${ua}`);
  lines.push('');
  lines.push(`Что делать:`);
  lines.push(`  ${advice}`);
  lines.push('');

  // Источник для понимания: window.error (sync/async), unhandledrejection,
  // ErrorBoundary (React).
  const source = (context && context.source) || 'unknown';
  lines.push(`— Детали —`);
  lines.push(`Источник: ${source}`);
  if (url) lines.push(`URL: ${url}`);
  if (stack) {
    // Первые 5 строк стека достаточно для диагноза
    const trimmedStack = stack.split('\n').slice(0, 6).join('\n');
    lines.push(`Stack:`);
    lines.push(trimmedStack);
  }
  return lines.join('\n');
}

// Backend error — body для sendOpsAlert.
function formatBackendAlertBody(err, req) {
  const { tag, advice } = categorizeBackendError(err);
  const lines = [];
  lines.push(`Тип: Backend · ${tag}`);
  if (req) lines.push(`Где: ${req.method} ${req.path || req.url || ''}`);
  lines.push(`Что: ${(err && err.message) || String(err)}`);
  if (err && err.code) lines.push(`Код: ${err.code}`);
  lines.push('');
  lines.push(`Что делать:`);
  lines.push(`  ${advice}`);
  lines.push('');
  if (err && err.stack) {
    const trimmedStack = String(err.stack).split('\n').slice(0, 6).join('\n');
    lines.push(`— Stack —`);
    lines.push(trimmedStack);
  }
  return lines.join('\n');
}

// для тестов
function _resetState() {
  seenHashes.clear();
  hourlyCount = 0;
  hourlyResetAt = Date.now() + 60 * 60 * 1000;
  suppressedCount = 0;
  lastSuppressedNoticeAt = 0;
}

module.exports = {
  sendOpsAlert,
  formatFrontendAlertBody,
  formatBackendAlertBody,
  // экспортированы для тестов категоризации
  describePage,
  describeUA,
  categorizeFrontendError,
  categorizeBackendError,
  _resetState,
};
