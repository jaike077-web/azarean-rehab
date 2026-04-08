// =====================================================
// AZAREAN NETWORK API SERVER v2.1
// С улучшенной безопасностью
// =====================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { testConnection } = require('./database/db');
const config = require('./config/config');

const app = express();
app.set('trust proxy', 1);
const PORT = config.port;

// =====================================================
// ПРОВЕРКА ОБЯЗАТЕЛЬНЫХ ПЕРЕМЕННЫХ
// =====================================================

if (config.jwt.secret.length < 32) {
  console.warn('⚠️  ВНИМАНИЕ: JWT_SECRET слишком короткий (рекомендуется минимум 32 символа)');
}

// =====================================================
// БЕЗОПАСНОСТЬ
// =====================================================

// Helmet - устанавливает безопасные HTTP заголовки
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://kinescope.io", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.kinescope.io", "https://kinescope.io"],
      frameSrc: ["'self'", "https://kinescope.io"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https://kinescope.io", "blob:"],
    },
  },
  hsts: config.nodeEnv === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS - ограниченный список разрешенных origins
const allowedOrigins = config.corsOrigins;

app.use(cors({
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (curl, мобильные приложения)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Access-Token'],
  maxAge: 86400 // Кешировать preflight на 24 часа
}));

// Rate Limiting - общий лимит
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: config.nodeEnv === 'production' ? 100 : 1000, // 100 запросов с одного IP
  message: {
    error: 'Too Many Requests',
    message: 'Слишком много запросов. Попробуйте позже.',
    retryAfter: '15 минут'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
// 👇 вместо app.use('/api', generalLimiter); делаем так:
if (config.nodeEnv === 'production') {
  app.use('/api', generalLimiter);
}

// Rate Limiting - строгий для авторизации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: config.nodeEnv === 'production' ? 5 : 15, // 5 попыток входа
  message: {
    error: 'Too Many Login Attempts',
    message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
    retryAfter: '15 минут'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Не считаем успешные входы
});

// Rate Limiting - для публичных endpoints с токенами (защита от brute force)
const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // 10 попыток
  message: {
    error: 'Too Many Requests',
    message: 'Слишком много попыток. Попробуйте через 15 минут.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Используем стандартный IP без кастомного keyGenerator для IPv6 совместимости
  validate: { xForwardedForHeader: false }
});

// Применяем token лимит к /api/complexes/token/* и no-referrer (токен в URL)
app.use('/api/complexes/token', tokenLimiter);
app.use('/api/complexes/token', (req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ВНИМАНИЕ: каталог /uploads НЕ раздаётся как статика.
// Аватары пациентов отдаются только через авторизованные эндпоинты
// (см. GET /api/patient-auth/avatar), чтобы исключить публичный доступ.

// Логирование запросов (без чувствительных данных)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const sanitizedPath = req.path.replace(/\/[a-f0-9-]{36}/gi, '/:id'); // Скрываем UUID
  console.log(`[${timestamp}] ${req.method} ${sanitizedPath}`);
  next();
});

// =====================================================
// БАЗОВЫЕ РОУТЫ
// =====================================================

// Информация об API
app.get('/', (req, res) => {
  res.json({
    message: '🏥 Azarean Network API',
    version: '2.1.0',
    status: 'running',
    security: {
      helmet: true,
      cors: true,
      rateLimiting: true
    },
    endpoints: {
      auth: '/api/auth',
      patientAuth: '/api/patient-auth',
      patients: '/api/patients',
      diagnoses: '/api/diagnoses',
      complexes: '/api/complexes',
      exercises: '/api/exercises',
      progress: '/api/progress',
      dashboard: '/api/dashboard',
      rehab: '/api/rehab',
      telegram: '/api/telegram',
      admin: '/api/admin'
    }
  });
});

// Health check
app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.json({
    status: dbConnected ? 'healthy' : 'unhealthy',
    database: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    environment: config.nodeEnv
  });
});

// =====================================================
// API РОУТЫ
// =====================================================

// Auth с усиленным rate limiting
const authRouter = require('./routes/auth');
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRouter);

// Остальные роуты
app.use('/api/patients', require('./routes/patients'));
app.use('/api/diagnoses', require('./routes/diagnoses'));
app.use('/api/complexes', require('./routes/complexes'));
app.use('/api/exercises', require('./routes/exercises'));
app.use('/api/import', require('./routes/import'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/templates', require('./routes/templates'));

// Авторизация пациентов (отдельная система!)
app.use('/api/patient-auth/login', authLimiter);
app.use('/api/patient-auth/register', authLimiter);
app.use('/api/patient-auth', require('./routes/patientAuth'));

// Реабилитационные программы (Спринт 1.1)
// Rate limit на публичные endpoints (phases, tips доступны без авторизации)
app.use('/api/rehab/phases', generalLimiter);
app.use('/api/rehab/tips', generalLimiter);
app.use('/api/rehab', require('./routes/rehab'));

// Telegram привязка (Спринт 3)
app.use('/api/telegram', require('./routes/telegram'));

// Админ-панель (Спринт 4)
app.use('/api/admin', require('./routes/admin'));

// =====================================================
// ОБРАБОТКА ОШИБОК
// =====================================================

// 404 Not Found
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/auth/me',
      'POST /api/patient-auth/login',
      'POST /api/patient-auth/register',
      'GET /api/patients',
      'GET /api/diagnoses',
      'GET /api/complexes',
      'GET /api/exercises',
      'GET /api/progress/complex/:id',
      'GET /api/dashboard/stats',
      'GET /api/rehab/phases',
      'GET /api/rehab/tips',
      'GET /api/rehab/my/dashboard',
      'GET /api/rehab/programs',
      'POST /api/telegram/link-code',
      'GET /api/telegram/status',
      'GET /api/admin/users',
      'GET /api/admin/stats',
      'GET /api/admin/audit-logs',
      'GET /api/admin/phases',
      'GET /api/admin/tips',
      'GET /api/admin/videos',
      'GET /api/admin/system'
    ]
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);

  // Определяем тип ошибки
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Не раскрываем детали в production
  const isDev = config.nodeEnv === 'development';

  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal Server Error' : message,
    message: message,
    ...(isDev && {
      stack: err.stack,
      details: err.details
    })
  });
});

// =====================================================
// ЗАПУСК СЕРВЕРА
// =====================================================

const startServer = async () => {
  try {
    // Проверяем подключение к БД
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('❌ Не удалось подключиться к базе данных');
      console.error('   Проверьте DB_HOST, DB_NAME, DB_USER и DB_PASSWORD в файле .env');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log('');
      console.log('╔═══════════════════════════════════════════════════════╗');
      console.log('║                                                       ║');
      console.log('║   🏥  AZAREAN NETWORK API SERVER v2.1                 ║');
      console.log('║                                                       ║');
      console.log('╠═══════════════════════════════════════════════════════╣');
      console.log('║                                                       ║');
      console.log(`║   ✅ Сервер:    http://localhost:${PORT}                 ║`);
      console.log('║   ✅ База:      PostgreSQL подключена                 ║');
      console.log(`║   ✅ Режим:     ${config.nodeEnv.padEnd(28)}║`);
      console.log('║                                                       ║');
      console.log('╠═══════════════════════════════════════════════════════╣');
      console.log('║   🔒 БЕЗОПАСНОСТЬ:                                    ║');
      console.log('║   • Helmet.js    — security headers ✓                 ║');
      console.log('║   • Rate Limit   — защита от брутфорса ✓              ║');
      console.log('║   • CORS         — ограничен источниками ✓            ║');
      console.log('║                                                       ║');
      console.log('╠═══════════════════════════════════════════════════════╣');
      console.log('║   Endpoints:                                          ║');
      console.log('║   • GET  /              - API info                    ║');
      console.log('║   • GET  /health        - Health check                ║');
      console.log('║   • POST /api/auth/*    - Авторизация                 ║');
      console.log('║   • GET  /api/patients  - Пациенты                    ║');
      console.log('║   • GET  /api/complexes - Комплексы                   ║');
      console.log('║   • GET  /api/exercises - Упражнения                  ║');
      console.log('║   🤖 TELEGRAM BOT:                                    ║');
      if (config.telegram.botToken) {
        console.log(`║   • @${config.telegram.botUsername.padEnd(15)} — подключён ✓          ║`);
      } else {
        console.log('║   • Токен не задан — бот отключён ✗                   ║');
      }
      console.log('║                                                       ║');
      console.log('╚═══════════════════════════════════════════════════════╝');
      console.log('');
      console.log('   Нажмите Ctrl+C для остановки');
      console.log('');

      // Запускаем Telegram бот и scheduler
      const { initBot } = require('./services/telegramBot');
      const { initScheduler } = require('./services/scheduler');
      initBot();
      initScheduler();
    });

  } catch (error) {
    console.error('❌ Ошибка при запуске сервера:', error);
    process.exit(1);
  }
};

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

const gracefulShutdown = (signal) => {
  console.log(`\n⚠️  ${signal} получен. Завершаю работу...`);
  try {
    const { getBot } = require('./services/telegramBot');
    const { stopScheduler } = require('./services/scheduler');
    const bot = getBot();
    if (bot) bot.stopPolling();
    stopScheduler();
  } catch (e) { /* ignore */ }
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Запуск (только при прямом вызове, не при импорте в тестах)
if (require.main === module) {
  startServer();
}

module.exports = app;
