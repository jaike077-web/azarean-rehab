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

  // Authentication
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Session
  session: {
    secret: process.env.SESSION_SECRET,
  },

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

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

if (!config.database.password && config.nodeEnv === 'production') {
  throw new Error('FATAL ERROR: DB_PASSWORD is not defined in .env file');
}

module.exports = config;
