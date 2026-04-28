// =====================================================
// Telegram OIDC service — поверх openid-client v6
//
// Discovery URL = TG_PROXY_URL/.well-known/openid-configuration. Прокси
// (tg-proxy.azarean.ru на финском VDS) переписывает в JSON-ответе:
//   token_endpoint  → tg-proxy.azarean.ru/token
//   jwks_uri        → tg-proxy.azarean.ru/.well-known/jwks.json
// А `issuer` остаётся `https://oauth.telegram.org` — это нужно для
// корректной проверки `iss` claim в ID-токене (он от Telegram приходит
// именно так).
//
// authorization_endpoint остаётся `https://oauth.telegram.org/auth` —
// туда юзер идёт браузером сам, прокси не нужен.
//
// Все исходящие HTTP от backend (discovery, token, jwks) идут через
// customFetch с header `X-Proxy-Secret`. Прокси проверяет секрет +
// IP-allowlist (только rehab-VDS).
//
// Зачем прокси: VDS на 185.93.109.234 не достукается до oauth.telegram.org
// напрямую (selective subnet filter у российского хостера), но финский
// VDS — может. Подробности — JARVIS_PROXY_REQUEST.md.
//
// openid-client ленивый require — он ESM-only внутри, Jest падает на
// import-statement если резолвить на module-load. Резолвим только когда
// route реально дёрнут.
// =====================================================

const config = require('../config/config');

const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
const SCOPES = 'openid profile phone telegram:bot_access';

let openidClientCache = null;
const getOpenidClient = () => {
  if (!openidClientCache) {
    openidClientCache = require('openid-client');
  }
  return openidClientCache;
};

let configurationPromise = null;

const isConfigured = () =>
  !!(config.telegramOidc.clientId &&
     config.telegramOidc.clientSecret &&
     config.telegramOidc.redirectUri &&
     config.tgProxy.url &&
     config.tgProxy.secret);

// customFetch добавляет X-Proxy-Secret ко всем исходящим запросам через
// openid-client. Прокси по этому хедеру решает, пускать или 403.
const buildProxyFetch = () => {
  return async (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('X-Proxy-Secret', config.tgProxy.secret);
    return fetch(url, { ...options, headers });
  };
};

// Lazy discovery + Configuration. Один раз кешируется на жизнь процесса.
// Если discovery упал (прокси временно лежит) — следующий вызов перепопытается.
const getConfiguration = async () => {
  if (configurationPromise) return configurationPromise;

  if (!isConfigured()) {
    throw new Error(
      'Telegram OIDC не настроен (нужны TELEGRAM_OIDC_CLIENT_ID/SECRET/REDIRECT_URI + TG_PROXY_URL/SECRET)'
    );
  }

  const openidClient = getOpenidClient();
  const discoveryUrl = new URL('/.well-known/openid-configuration', config.tgProxy.url);

  configurationPromise = openidClient
    .discovery(
      discoveryUrl,
      config.telegramOidc.clientId,
      config.telegramOidc.clientSecret,
      undefined,
      { [openidClient.customFetch]: buildProxyFetch() }
    )
    .catch((err) => {
      configurationPromise = null;
      throw err;
    });

  return configurationPromise;
};

// Старт OAuth flow. Возвращает URL который ведёт юзера на oauth.telegram.org/auth.
// Caller (route) сохраняет state/nonce/codeVerifier в БД до callback'а.
const buildAuthorizeUrl = async () => {
  const cfg = await getConfiguration();
  const openidClient = getOpenidClient();

  const state = openidClient.randomState();
  const nonce = openidClient.randomNonce();
  const codeVerifier = openidClient.randomPKCECodeVerifier();
  const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier);

  const params = {
    redirect_uri: config.telegramOidc.redirectUri,
    scope: SCOPES,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  };

  const authUrl = openidClient.buildAuthorizationUrl(cfg, params);

  return {
    authUrl: authUrl.href,
    state,
    nonce,
    codeVerifier,
  };
};

// Callback handler. Принимает полный URL текущего запроса (с query
// params от Telegram) + ожидаемые state/nonce/codeVerifier из БД.
// Возвращает claims из ID-токена.
const handleCallback = async (currentUrl, expected) => {
  const cfg = await getConfiguration();
  const openidClient = getOpenidClient();

  const tokens = await openidClient.authorizationCodeGrant(cfg, new URL(currentUrl), {
    pkceCodeVerifier: expected.codeVerifier,
    expectedState: expected.state,
    expectedNonce: expected.nonce,
  });

  return tokens.claims();
};

module.exports = {
  buildAuthorizeUrl,
  handleCallback,
  isConfigured,
  TELEGRAM_ISSUER,
};
