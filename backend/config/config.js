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

  // Telegram Bot
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'azarean_rehab_bot',
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

module.exports = config;
