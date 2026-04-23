// =====================================================
// PM2 ecosystem — Azarean Rehab backend (production)
// -----------------------------------------------------
// Запуск: pm2 start /opt/azarean-rehab/deploy/ecosystem.config.js --env production
// Рестарт: pm2 restart azarean-rehab
// Логи:  pm2 logs azarean-rehab
//
// Правила проекта (см. /opt/jarvis-director/CLAUDE.md секция 7):
//  - fork mode (cluster несовместим с ESM)
//  - NODE_OPTIONS=--dns-result-order=ipv4first (IPv6 не маршрутизируется)
//  - trustProxy=true уже в коде, за nginx обязательно
//  - pm2-logrotate подхватит автоматически
// =====================================================

module.exports = {
  apps: [
    {
      name: 'azarean-rehab',
      script: './server.js',
      cwd: '/opt/azarean-rehab/backend',

      // Fork mode обязателен: cluster ломает ESM и long-polling Telegram бота
      exec_mode: 'fork',
      instances: 1,

      // Node options — ipv4first критичен на этом VDS (IPv6 отключён)
      node_args: '--dns-result-order=ipv4first',

      // Автоперезапуск при падении
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 4000,

      // Watch выключен — перезапуск через pm2 restart после deploy
      watch: false,

      // Лимит памяти — если процесс раздулся, pm2 перезапустит
      max_memory_restart: '512M',

      // Graceful shutdown — Express слушает SIGINT/SIGTERM
      kill_timeout: 5000,
      wait_ready: false,

      // Файлы логов (pm2-logrotate их ротирует автоматически)
      error_file: '/var/log/pm2/azarean-rehab-error.log',
      out_file:   '/var/log/pm2/azarean-rehab-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Переменные окружения берутся из /opt/azarean-rehab/backend/.env.production
      // dotenv подключается в config/config.js через NODE_ENV=production
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Остальное в .env.production — не дублируем здесь чтобы
        // случайно не закоммитить секреты
      },
    },
  ],
};
