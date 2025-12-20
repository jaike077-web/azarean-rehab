// =====================================================
// AZAREAN NETWORK API SERVER v2.1
// С улучшенной безопасностью
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { testConnection } = require('./database/db');


const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// =====================================================
// ПРОВЕРКА ОБЯЗАТЕЛЬНЫХ ПЕРЕМЕННЫХ
// =====================================================

if (!process.env.JWT_SECRET) {
  console.error('❌ ОШИБКА: JWT_SECRET не установлен в .env');
  console.error('   Добавьте JWT_SECRET в файл .env');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  ВНИМАНИЕ: JWT_SECRET слишком короткий (рекомендуется минимум 32 символа)');
}

// =====================================================
// БЕЗОПАСНОСТЬ
// =====================================================

// Helmet - устанавливает безопасные HTTP заголовки
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // Отключаем для разработки, включите в production
}));

// CORS - настройка разрешённых источников
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:5173'];

  app.use(cors({
    origin: function(origin, callback) {
      // Разрешаем запросы без origin (мобильные приложения, Postman)
      if (!origin) return callback(null, true);
      
      // Убираем trailing slash для сравнения
      const normalizedOrigin = origin.replace(/\/$/, '');
      
      if (allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️  Заблокирован CORS запрос с: ${origin}`);
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

// Rate Limiting - общий лимит
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 100 запросов с одного IP
  message: {
    error: 'Too Many Requests',
    message: 'Слишком много запросов. Попробуйте позже.',
    retryAfter: '15 минут'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
// 👇 вместо app.use('/api', generalLimiter); делаем так:
if (process.env.NODE_ENV === 'production') {
  app.use('/api', generalLimiter);
}

// Rate Limiting - строгий для авторизации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: process.env.NODE_ENV === 'production' ? 5 : 15, // 5 попыток входа
  message: {
    error: 'Too Many Login Attempts',
    message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
    retryAfter: '15 минут'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Не считаем успешные входы
});

// Применяем общий лимит ко всем API роутам
app.use('/api/', generalLimiter);

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
      patients: '/api/patients',
      diagnoses: '/api/diagnoses',
      complexes: '/api/complexes',
      exercises: '/api/exercises',
      progress: '/api/progress',
      dashboard: '/api/dashboard'
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
    environment: process.env.NODE_ENV || 'development'
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
app.use('/api/progress', require('./routes/progress'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/templates', require('./routes/templates'));

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
      'GET /api/patients',
      'GET /api/diagnoses',
      'GET /api/complexes',
      'GET /api/exercises',
      'GET /api/progress/complex/:id',
      'GET /api/dashboard/stats'
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
  const isDev = process.env.NODE_ENV === 'development';
  
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
      console.error('   Проверьте DATABASE_URL в файле .env');
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
      console.log(`║   ✅ Режим:     ${(process.env.NODE_ENV || 'development').padEnd(28)}║`);
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
      console.log('║                                                       ║');
      console.log('╚═══════════════════════════════════════════════════════╝');
      console.log('');
      console.log('   Нажмите Ctrl+C для остановки');
      console.log('');
    });

  } catch (error) {
    console.error('❌ Ошибка при запуске сервера:', error);
    process.exit(1);
  }
};

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM получен. Завершаю работу...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n\n⚠️  SIGINT получен. Завершаю работу...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Запуск
startServer();