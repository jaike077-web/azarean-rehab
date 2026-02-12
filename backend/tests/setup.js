// Устанавливаем переменные окружения ДО загрузки config.js
// Jest setupFiles выполняется до require() любых модулей
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long!!';
process.env.PATIENT_JWT_SECRET = 'test-patient-jwt-secret-32-chars!!!!';
process.env.NODE_ENV = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'azarean_rehab_test';
process.env.TELEGRAM_BOT_TOKEN = '';
