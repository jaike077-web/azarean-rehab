require('dotenv').config();

const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'azarean_rehab',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },

  // Authentication (инструкторы)
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h', // Уменьшено с 7d для безопасности
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Authentication (пациенты — ОТДЕЛЬНЫЕ секреты!)
  patient: {
    jwtSecret: process.env.PATIENT_JWT_SECRET,
    jwtExpiresIn: process.env.PATIENT_JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.PATIENT_REFRESH_EXPIRES_IN || '30d',
  },

  // Session
  session: {
    secret: process.env.SESSION_SECRET,
  },

  // CORS - список разрешенных origins через запятую
  corsOrigins: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim()),

  // Frontend URL для генерации ссылок пациентам
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Telegram Bot (long polling уведомлений + diary wizard).
  // OIDC-логин использует отдельный набор переменных ниже.
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'azarean_rehab_bot',
    loginEnabled: process.env.TELEGRAM_LOGIN_ENABLED === 'true',
  },

  // Telegram OIDC (BotFather → Login Widget → Switch to OpenID Connect Login).
  // Backend использует TG_PROXY_* (см. ниже) чтобы достукаться до Telegram —
  // напрямую с rehab-VDS не получается (subnet filter у российского хостера).
  telegramOidc: {
    clientId: process.env.TELEGRAM_OIDC_CLIENT_ID || '',
    clientSecret: process.env.TELEGRAM_OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.TELEGRAM_OIDC_REDIRECT_URI || '',
  },

  // Прокси на финский VDS (поднят JARVIS-Director'ом на 78.17.1.70).
  // openid-client ходит через https://tg-proxy.azarean.ru с header
  // X-Proxy-Secret. Прокси whitelist'ит /.well-known/* и /token, ip-allowlist
  // только 185.93.109.234 (prod IP rehab-VDS). См. JARVIS_PROXY_REQUEST.md.
  tgProxy: {
    url: process.env.TG_PROXY_URL || '',
    secret: process.env.TG_PROXY_SECRET || '',
  },

  // Yandex OAuth 2.0 (regular, без OIDC discovery). Прокси НЕ нужен —
  // oauth.yandex.ru и login.yandex.ru доступны с rehab-VDS напрямую.
  // Scopes увидены в Cabinet (oauth.yandex.ru) при создании приложения:
  //   login:info          — id, login, real_name, first_name, last_name, sex
  //   login:email         — default_email, emails[]
  //   login:avatar        — default_avatar_id (URL формирует backend)
  //   login:default_phone — default_phone: { id, number } (E.164 +CC...)
  // login:default_phone критичен для silent autolink — без него
  // userinfo не вернёт телефон, и phone-match с patients.phone не сматчит.
  yandexOauth: {
    clientId: process.env.YANDEX_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.YANDEX_OAUTH_CLIENT_SECRET || '',
    redirectUri: process.env.YANDEX_OAUTH_REDIRECT_URI || '',
    scopes: process.env.YANDEX_OAUTH_SCOPES || 'login:info login:email login:avatar login:default_phone',
    loginEnabled: process.env.YANDEX_LOGIN_ENABLED === 'true',
  },

  // Kinescope
  kinescope: {
    apiKey: process.env.KINESCOPE_API_KEY,
    projectId: process.env.KINESCOPE_PROJECT_ID,
    folderId: process.env.KINESCOPE_FOLDER_ID || null, 
    apiUrl: 'https://api.kinescope.io/v1',
  },
};

// Validation - fail fast if critical secrets missing
if (!config.jwt.secret) {
  throw new Error('FATAL ERROR: JWT_SECRET is not defined in .env file');
}

if (!config.patient.jwtSecret) {
  throw new Error('FATAL ERROR: PATIENT_JWT_SECRET is not defined in .env file');
}

if (!config.database.password && config.nodeEnv === 'production') {
  throw new Error('FATAL ERROR: DB_PASSWORD is not defined in .env file');
}

if (!config.session.secret) {
  console.warn('⚠️  SESSION_SECRET не задан — используется небезопасное значение по умолчанию');
}

if (config.nodeEnv === 'production') {
  if (!config.telegram.botToken) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN не задан — Telegram бот будет отключён');
  }
  if (!config.kinescope.apiKey) {
    console.warn('⚠️  KINESCOPE_API_KEY не задан — интеграция с Kinescope недоступна');
  }
}

module.exports = config;
