// =====================================================
// TEST: db.js pool.on('error') НЕ роняет процесс
// =====================================================
// Регресс-защита: раньше pool.on('error') делал process.exit(-1) → при кратком
// сетевом блипе БД в связке с PM2 max_restarts давал перманентный аутаж кабинета.
// Этот файл НЕ мокает database/db — тестирует реальный модуль + его pool.
// =====================================================

describe('db pool error handler', () => {
  afterAll(async () => {
    // Этот файл требует реальный модуль db (создаёт pg Pool) — закрываем,
    // чтобы не оставлять открытый handle (jest worker leak).
    try {
      const { pool } = require('../../database/db');
      await pool.end();
    } catch (_) { /* pool мог не подключиться — норм */ }
  });

  it('idle-client error НЕ вызывает process.exit', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit вызван — это регресс!');
    });

    const { pool } = require('../../database/db');

    // Эмулируем фоновую ошибку idle-клиента пула
    expect(() => pool.emit('error', new Error('ECONNRESET'), {})).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});
