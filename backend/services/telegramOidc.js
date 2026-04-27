// =====================================================
// Telegram OIDC service — обёртка над openid-client v6
//
// Telegram стал OIDC-провайдером в 2024, поверх @BotFather Login Widget.
// Discovery: https://oauth.telegram.org/.well-known/openid-configuration
//
// Scopes:
//   openid                — обязательный, sub = Telegram user id
//   profile               — name, preferred_username, picture
//   phone                 — verified phone_number в ID-токене (E.164)
//   telegram:bot_access   — позволяет нашему боту слать сообщения юзеру
//                           без /start (автозакрывает Telegram-привязку)
//
// Userinfo endpoint у Telegram отсутствует — все клеймы в ID-токене.
// =====================================================

// openid-client v6 публикует CJS-обёртку, которая внутри содержит ESM
// import — Node 20 это переваривает, но Jest падает с
// "Cannot use import statement outside a module".
// Решение: лениво require внутри функций, чтобы при загрузке модуля
// (и тем более routes/patientAuth → require('./services/telegramOidc'))
// мы НЕ тащили openid-client в process. В тестах OAuth-flow не дёргается,
// поэтому ESM-парсер никогда не будет вызван.
const config = require('../config/config');

const ISSUER = 'https://oauth.telegram.org';
const SCOPES = 'openid profile phone telegram:bot_access';

let openidClientCache = null;
const getOpenidClient = () => {
  if (!openidClientCache) {
    openidClientCache = require('openid-client');
  }
  return openidClientCache;
};

let configurationPromise = null;

// Лениво один раз делаем discovery + создаём Configuration. Если discovery
// упал (Telegram down при старте сервера) — следующий вызов пере-попробует.
const getConfiguration = async () => {
  if (configurationPromise) return configurationPromise;

  if (!config.telegramOidc.clientId || !config.telegramOidc.clientSecret) {
    throw new Error('Telegram OIDC не настроен (TELEGRAM_OIDC_CLIENT_ID/SECRET в .env)');
  }

  const openidClient = getOpenidClient();
  configurationPromise = openidClient
    .discovery(
      new URL(ISSUER),
      config.telegramOidc.clientId,
      config.telegramOidc.clientSecret
    )
    .catch((err) => {
      configurationPromise = null;
      throw err;
    });

  return configurationPromise;
};

// Старт OAuth-flow: генерим state/nonce/code_verifier, строим authorization URL.
// Возвращаем { authUrl, state, nonce, codeVerifier } — caller сохраняет state/nonce/
// codeVerifier в БД (patient_oauth_states), редиректит юзера на authUrl.
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

// Обработка callback: проверяем state/nonce/PKCE, обмениваем code на токены.
// currentUrl = req.originalUrl с полным host — содержит ?code=...&state=...
// Возвращаем claims из ID-токена: { sub, name, preferred_username, picture,
// phone_number, ... } или кидает ошибку при невалидном flow.
const handleCallback = async (currentUrl, expected) => {
  const cfg = await getConfiguration();
  const openidClient = getOpenidClient();

  // expected = { state, nonce, codeVerifier } из БД (то что положили на старте)
  const tokens = await openidClient.authorizationCodeGrant(cfg, new URL(currentUrl), {
    pkceCodeVerifier: expected.codeVerifier,
    expectedState: expected.state,
    expectedNonce: expected.nonce,
  });

  // tokens.id_token уже валидирован openid-client (signature + iss + aud + exp + nonce)
  const claims = tokens.claims();
  return claims;
};

module.exports = {
  buildAuthorizeUrl,
  handleCallback,
  ISSUER,
};
