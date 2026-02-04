const { Pool } = require('pg');
const config = require('../config/config');

// Создаем пул подключений к базе данных
const pool = new Pool(config.database);

// Log connection (without password!)
console.log(
  `Database connected to ${config.database.host}:${config.database.port}/${config.database.database}`
);

// Обработка ошибок подключения
pool.on('error', (err, client) => {
  console.error('Неожиданная ошибка подключения к БД:', err);
  process.exit(-1);
});

// Функция для выполнения запросов
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Логируем только в development и без параметров (безопасность)
    if (config.nodeEnv === 'development') {
      // Обрезаем длинные запросы и скрываем параметры
      const sanitizedQuery = text.replace(/\s+/g, ' ').substring(0, 80);
      console.log('Query:', { query: sanitizedQuery + (text.length > 80 ? '...' : ''), duration, rows: res.rowCount });
    }

    return res;
  } catch (error) {
    // Логируем только сообщение об ошибке, не параметры
    console.error('Ошибка выполнения запроса:', error.message);
    throw error;
  }
};

// Функция для получения клиента
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

// Тестирование подключения
const testConnection = async () => {
  try {
    const result = await query('SELECT NOW()');
    console.log('✅ Подключение к базе данных успешно!');
    console.log('📅 Время сервера БД:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error.message);
    return false;
  }
};

module.exports = {
  query,
  getClient,
  pool,
  testConnection
};
