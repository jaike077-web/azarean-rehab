// =====================================================
// Telegram Login Widget (legacy HMAC) — без OIDC
//
// Зачем: VDS не достукается до oauth.telegram.org (selective subnet
// filter у российского хостера), поэтому server-to-server OIDC flow
// невозможен. Зато юзер из браузера до Telegram доходит, поэтому
// используем legacy виджет: popup открывается у юзера, возвращает к
// нам data через query, мы проверяем HMAC локально (никаких сетевых
// запросов с backend к Telegram).
//
// Docs: https://core.telegram.org/widgets/login#checking-authorization
//
// Алгоритм проверки:
//   1. Из query берём все параметры кроме 'hash'
//   2. Сортируем по ключу, склеиваем в "key=value\nkey=value..."
//   3. secret_key = SHA256(bot_token)  — RAW BYTES
//   4. expected_hash = HMAC_SHA256(data_check_string, secret_key) — hex
//   5. Сверяем с пришедшим hash через timingSafeEqual
//   6. Доп: auth_date не должен быть старше 24 ч (защита от replay)
// =====================================================

const crypto = require('crypto');
const config = require('../config/config');

const AUTH_FRESHNESS_SECONDS = 24 * 60 * 60; // 24 ч

// Строит URL авторизации Telegram Login Widget — то что виджет JavaScript
// открывает в popup'е. Мы вместо виджета 302-нем юзера сразу сюда — поток
// получается тот же. После consent Telegram редиректит на return_to с
// query-params {id, first_name, last_name, username, photo_url, auth_date, hash}.
const buildAuthUrl = (returnTo, origin) => {
  if (!config.telegram.botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN не задан');
  }
  const botId = config.telegram.botToken.split(':')[0];
  const params = new URLSearchParams({
    bot_id: botId,
    origin,
    return_to: returnTo,
    request_access: 'write', // даёт нашему боту право слать сообщения юзеру
  });
  return `https://oauth.telegram.org/auth?${params.toString()}`;
};

// Проверка HMAC. Возвращает { valid, reason, data } где data — те же поля
// что пришли в query (без hash). При невалидном hash или просроченном
// auth_date возвращает valid=false с понятной причиной.
const verifyAuthData = (query) => {
  if (!config.telegram.botToken) {
    return { valid: false, reason: 'TELEGRAM_BOT_TOKEN не задан' };
  }
  if (!query || typeof query !== 'object') {
    return { valid: false, reason: 'Параметры отсутствуют' };
  }

  const { hash, ...rest } = query;
  if (!hash || typeof hash !== 'string') {
    return { valid: false, reason: 'Параметр hash отсутствует' };
  }

  // Берём только Telegram-поля (фильтруем мусор/инжекцию). Telegram гарантирует
  // вот эти семь.
  const ALLOWED = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'];
  const data = {};
  for (const key of ALLOWED) {
    if (rest[key] !== undefined && rest[key] !== '') {
      data[key] = String(rest[key]);
    }
  }

  if (!data.id || !data.auth_date) {
    return { valid: false, reason: 'Обязательные поля id/auth_date отсутствуют' };
  }

  // data_check_string — отсортированный по ключу join("\n", "key=value")
  const dataCheckString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');

  // secret_key = SHA256(bot_token) raw bytes
  const secretKey = crypto.createHash('sha256').update(config.telegram.botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // timingSafeEqual ожидает Buffer'ы одинаковой длины
  const providedBuf = Buffer.from(hash, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, reason: 'Подпись Telegram не совпадает' };
  }

  // Replay-защита: auth_date в Unix-секундах
  const authAge = Math.floor(Date.now() / 1000) - parseInt(data.auth_date, 10);
  if (Number.isNaN(authAge) || authAge < 0 || authAge > AUTH_FRESHNESS_SECONDS) {
    return { valid: false, reason: 'Срок действия авторизации истёк' };
  }

  return { valid: true, data };
};

module.exports = {
  buildAuthUrl,
  verifyAuthData,
  AUTH_FRESHNESS_SECONDS,
};
