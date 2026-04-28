// =====================================================
// Yandex OAuth 2.0 service — обычный Authorization Code Flow + PKCE.
//
// В отличие от Telegram'а — Yandex НЕ публикует OIDC discovery
// (/.well-known/openid-configuration возвращает 404), нет ID-токена,
// нет JWKS. Это чистый OAuth 2.0:
//   1) Юзер идёт на oauth.yandex.ru/authorize?...
//   2) Yandex редиректит обратно с ?code=...
//   3) Backend POST /token (code → access_token)
//   4) Backend GET login.yandex.ru/info с Authorization: OAuth <token>
//
// Прокси НЕ нужен — oauth.yandex.ru и login.yandex.ru доступны с
// rehab-VDS напрямую.
//
// PKCE S256 защищает code в transit'е (state — от CSRF/replay'я).
//
// Phone: scope login:phone (точное имя задаётся в env, см. config)
// возвращает default_phone: { id, number } в формате "+79037659418".
// =====================================================

const crypto = require('crypto');
const config = require('../config/config');

const AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const TOKEN_URL = 'https://oauth.yandex.ru/token';
const USERINFO_URL = 'https://login.yandex.ru/info';

const isConfigured = () =>
  !!(config.yandexOauth.clientId &&
     config.yandexOauth.clientSecret &&
     config.yandexOauth.redirectUri);

// PKCE: codeVerifier — случайные 32 байта в base64url, codeChallenge — SHA-256(verifier) base64url.
const base64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const generatePkce = () => {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
};

const generateState = () => base64url(crypto.randomBytes(24));

// Старт OAuth flow. Caller сохраняет state + codeVerifier в БД.
const buildAuthorizeUrl = () => {
  if (!isConfigured()) {
    throw new Error('Yandex OAuth не настроен (нужны YANDEX_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)');
  }

  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePkce();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.yandexOauth.clientId,
    redirect_uri: config.yandexOauth.redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // force_confirm=yes заставляет Yandex показывать consent даже если юзер
    // уже разрешал — иначе при повторном входе в другой акк Yandex молча
    // подсовывает тот же. force_confirm включает выбор аккаунта.
    force_confirm: 'yes',
  });

  if (config.yandexOauth.scopes) {
    params.set('scope', config.yandexOauth.scopes);
  }

  const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;
  return { authUrl, state, codeVerifier };
};

// Обмен code на access_token. Yandex поддерживает client_secret в body
// (application/x-www-form-urlencoded). HTTP Basic тоже работает, но body
// проще — никаких разбежек с тем как кодируется client_id с двоеточиями.
const exchangeCodeForToken = async (code, codeVerifier) => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.yandexOauth.clientId,
    client_secret: config.yandexOauth.clientSecret,
    redirect_uri: config.yandexOauth.redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json || !json.access_token) {
    const detail = json
      ? `${json.error || 'unknown'}: ${json.error_description || JSON.stringify(json)}`
      : `HTTP ${response.status}`;
    throw new Error(`Yandex token exchange failed — ${detail}`);
  }

  return json.access_token;
};

// GET /info с Authorization: OAuth <token>. Возвращает плоский объект:
//   id, login, default_email, emails, real_name, first_name, last_name,
//   display_name, default_avatar_id, default_phone: { id, number }, ...
const fetchUserInfo = async (accessToken) => {
  const response = await fetch(USERINFO_URL, {
    method: 'GET',
    headers: {
      Authorization: `OAuth ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Yandex userinfo failed — HTTP ${response.status}`);
  }

  return response.json();
};

// Полный OAuth-обмен: code → access_token → userinfo.
// Возвращает userinfo claims (плоский Yandex-объект, не OIDC).
const handleCallback = async (code, codeVerifier) => {
  const accessToken = await exchangeCodeForToken(code, codeVerifier);
  return fetchUserInfo(accessToken);
};

// Извлекает поля для match-flow и pre-fill регистрации.
// Не применяет normalizePhone — это делает caller (route), чтобы
// тесты сервиса не зависели от utils/phone.
const extractClaims = (info) => {
  const fullName =
    info.real_name ||
    info.display_name ||
    [info.first_name, info.last_name].filter(Boolean).join(' ').trim() ||
    info.login ||
    'Пациент';

  const email =
    info.default_email ||
    (Array.isArray(info.emails) && info.emails[0]) ||
    null;

  const phone =
    (info.default_phone && info.default_phone.number) ||
    null;

  // Yandex отдаёт avatar_id, URL формируется так. is_avatar_empty=true → нет аватара.
  const avatarUrl =
    !info.is_avatar_empty && info.default_avatar_id
      ? `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`
      : null;

  return {
    providerId: String(info.id),
    fullName,
    email,
    phone,
    avatarUrl,
  };
};

module.exports = {
  isConfigured,
  buildAuthorizeUrl,
  handleCallback,
  extractClaims,
  // экспортированы для тестов
  exchangeCodeForToken,
  fetchUserInfo,
};
