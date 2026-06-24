const { Pool, types } = require('pg');
const config = require('../config/config');

// HF#11 (2026-05-19): pg-node по умолчанию возвращает BIGINT (int8, oid=20)
// как string чтобы избежать precision loss для значений > Number.MAX_SAFE_INTEGER
// (2^53 ≈ 9×10^15). В нашей схеме BIGINT используется только для
// rom_measurements.measurement_session_id + girth_measurements.measurement_session_id —
// frontend генерирует Date.now() millis (~1.7×10^12), ≪ 2^53, безопасно.
// patients.telegram_chat_id — NUMERIC(20), НЕ затрагивается (oid=1700).
// Если в будущем добавятся BIGINT columns с values > 2^53 — нужно вернуть default
// и обрабатывать те column'ы локально.
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

// Создаем пул подключений к базе данных
const pool = new Pool(config.database);

// Log connection (without password!)
console.log(
  `Database connected to ${config.database.host}:${config.database.port}/${config.database.database}`
);

// Обработка ошибок idle-клиента пула.
// НЕ делаем process.exit — pg сам пересоздаёт битые соединения, а активные
// запросы отвалятся через try/catch в query(). Раньше process.exit(-1) при
// кратком сетевом блипе БД в связке с PM2 max_restarts (исчерпание за <30с)
// давал ПЕРМАНЕНТНЫЙ аутаж всего кабинета. Резервный канал алерта — Этап 2.
pool.on('error', (err) => {
  console.error('Неожиданная ошибка пула БД (idle client):', err.message);
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
