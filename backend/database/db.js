const { Pool } = require('pg');
require('dotenv').config();

// Создаем пул подключений к базе данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

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
    console.log('Выполнен запрос:', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Ошибка выполнения запроса:', error);
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