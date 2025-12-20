require('dotenv').config();
const { testConnection } = require('./database/db');

// Тестируем подключение
console.log('🔌 Проверяем подключение к PostgreSQL...');
console.log('📍 DATABASE_URL:', process.env.DATABASE_URL);

testConnection()
  .then((success) => {
    if (success) {
      console.log('✅ Тест пройден успешно!');
      process.exit(0);
    } else {
      console.log('❌ Тест провален');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('💥 Критическая ошибка:', error);
    process.exit(1);
  });