// =====================================================
// TESTS: Telegram Bot Service
// Sprint 3 — Telegram-бот
// =====================================================

// Mock db
jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
}));

// Mock node-telegram-bot-api
const mockSendMessage = jest.fn().mockResolvedValue({});
const mockSetMyCommands = jest.fn().mockResolvedValue(true);
const mockOnText = jest.fn();
const mockOn = jest.fn();
const mockAnswerCallbackQuery = jest.fn().mockResolvedValue(true);
const mockStopPolling = jest.fn();

jest.mock('node-telegram-bot-api', () => {
  return jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
    setMyCommands: mockSetMyCommands,
    onText: mockOnText,
    on: mockOn,
    answerCallbackQuery: mockAnswerCallbackQuery,
    stopPolling: mockStopPolling,
  }));
});

const { query } = require('../../database/db');

// =====================================================
// SETUP
// =====================================================

beforeEach(() => {
  jest.clearAllMocks();
  // Reset module cache to get clean state
  delete require.cache[require.resolve('../../services/telegramBot')];
});

// =====================================================
// initBot
// =====================================================
describe('initBot', () => {

  it('should return null when TELEGRAM_BOT_TOKEN is empty', () => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = '';

    const { initBot } = require('../../services/telegramBot');
    const result = initBot();

    expect(result).toBeNull();
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });

  it('should create bot instance when token is set', () => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-123';

    delete require.cache[require.resolve('../../services/telegramBot')];
    const { initBot } = require('../../services/telegramBot');
    const result = initBot();

    expect(result).toBeDefined();
    expect(mockSetMyCommands).toHaveBeenCalled();
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });
});

// =====================================================
// Bot command handlers (unit tests via registered callbacks)
// =====================================================
describe('Bot command handlers', () => {
  let handlers;

  beforeEach(() => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-123';

    delete require.cache[require.resolve('../../services/telegramBot')];
    const { initBot } = require('../../services/telegramBot');
    initBot();

    // Collect registered handlers
    handlers = {};
    mockOnText.mock.calls.forEach(([regex, handler]) => {
      const cmdMatch = regex.toString().match(/\\\/(\w+)/);
      if (cmdMatch) handlers[cmdMatch[1]] = handler;
    });

    // Collect event handlers
    mockOn.mock.calls.forEach(([event, handler]) => {
      handlers[event] = handler;
    });

    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });

  describe('/start without code', () => {
    it('should show welcome message when no patient linked', async () => {
      // Mock: getPatientByChatId returns null
      query.mockResolvedValueOnce({ rows: [] });

      const msg = { chat: { id: 111 } };
      await handlers.start(msg, ['', '']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('Добро пожаловать'),
        expect.any(Object)
      );
    });

    it('should show already linked message when patient exists', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Тест', email: 'a@b.com' }] });

      const msg = { chat: { id: 111 } };
      await handlers.start(msg, ['', '']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('Вы уже подключены'),
        expect.any(Object)
      );
    });
  });

  describe('/start with valid code', () => {
    it('should link patient account', async () => {
      // getPatientByChatId — not called for code flow
      // query for SELECT code
      query.mockResolvedValueOnce({
        rows: [{ id: 1, patient_id: 14, expires_at: new Date(Date.now() + 600000), used: false }],
      });
      // UPDATE code used = true
      query.mockResolvedValueOnce({ rows: [] });
      // UPDATE patient telegram_chat_id
      query.mockResolvedValueOnce({ rows: [] });
      // SELECT patient full_name
      query.mockResolvedValueOnce({ rows: [{ full_name: 'Вадим' }] });

      const msg = { chat: { id: 999 } };
      await handlers.start(msg, [' A1B2C3', ' A1B2C3']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        999,
        expect.stringContaining('Аккаунт привязан'),
        expect.any(Object)
      );
      // Should have updated telegram_chat_id
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE patients SET telegram_chat_id'),
        [999, 14]
      );
    });
  });

  describe('/start with invalid code', () => {
    it('should show error for non-existent code', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // code not found

      const msg = { chat: { id: 111 } };
      await handlers.start(msg, [' BADCOD', ' BADCOD']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('Неверный код'),
        expect.any(Object)
      );
    });

    it('should show error for expired code', async () => {
      query.mockResolvedValueOnce({
        rows: [{ id: 1, patient_id: 14, expires_at: new Date(Date.now() - 600000), used: false }],
      });

      const msg = { chat: { id: 111 } };
      await handlers.start(msg, [' EXPIRD', ' EXPIRD']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('Код истёк'),
        expect.any(Object)
      );
    });

    it('should show error for already used code', async () => {
      query.mockResolvedValueOnce({
        rows: [{ id: 1, patient_id: 14, expires_at: new Date(Date.now() + 600000), used: true }],
      });

      const msg = { chat: { id: 111 } };
      await handlers.start(msg, [' USEDUP', ' USEDUP']);

      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('уже использован'),
        expect.any(Object)
      );
    });
  });

  describe('/status', () => {
    it('should show status for linked patient', async () => {
      // getPatientByChatId
      query.mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Тест', email: 'a@b.com' }] });
      // program
      query.mockResolvedValueOnce({
        rows: [{ title: 'ACL Rehab', current_phase: 1, phase_title: 'Защита', phase_subtitle: '0-2 нед.', surgery_date: '2026-01-01' }],
      });
      // streak
      query.mockResolvedValueOnce({
        rows: [{ current_streak: 5, longest_streak: 10, total_days: 20 }],
      });
      // diary today
      query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const msg = { chat: { id: 111 } };
      await handlers.status(msg);

      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('Стрик: 5'),
        expect.any(Object)
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('Дневник сегодня заполнен'),
        expect.any(Object)
      );
    });

    it('should show not linked message for unknown user', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // no patient

      const msg = { chat: { id: 999 } };
      await handlers.status(msg);

      expect(mockSendMessage).toHaveBeenCalledWith(
        999,
        expect.stringContaining('не привязан'),
        expect.any(Object)
      );
    });

    // Wave 1 #1.04 — multi-protocol: фаза подтягивается JOIN'ом по rp.program_type,
    // не хардкоду 'acl'. Проверяем SQL программы.
    it('Wave 1 #1.04: SQL фаз использует rp.program_type, не хардкод acl', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Тест', email: 'a@b.com' }] });
      query.mockResolvedValueOnce({ rows: [{ title: 'Shoulder Rehab', current_phase: 1, phase_title: 'Защита', phase_subtitle: 'нед 0-2', surgery_date: null }] });
      query.mockResolvedValueOnce({ rows: [{ current_streak: 0, longest_streak: 0, total_days: 0 }] });
      query.mockResolvedValueOnce({ rows: [] }); // no diary today

      const msg = { chat: { id: 222 } };
      await handlers.status(msg);

      // Найти SQL программы среди вызовов (2-й вызов после getPatientByChatId)
      const programSql = query.mock.calls[1][0];
      expect(programSql).toMatch(/ph\.program_type\s*=\s*rp\.program_type/);
      expect(programSql).not.toMatch(/program_type\s*=\s*'acl'/);
    });
  });

  describe('/tip', () => {
    it('should return a tip for linked patient', async () => {
      // getPatientByChatId
      query.mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Тест', email: 'a@b.com' }] });
      // program
      query.mockResolvedValueOnce({ rows: [{ current_phase: 1 }] });
      // tip
      query.mockResolvedValueOnce({
        rows: [{ title: 'Совет дня', body: 'Продолжайте!', icon: '💪' }],
      });

      const msg = { chat: { id: 111 } };
      await handlers.tip(msg);

      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('Совет дня'),
        expect.any(Object)
      );
    });
  });

  describe('/help', () => {
    it('should return command list', async () => {
      const msg = { chat: { id: 111 } };
      await handlers.help(msg);

      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('Команды бота'),
        expect.any(Object)
      );
    });
  });

  describe('/diary', () => {
    it('should start diary wizard for linked patient', async () => {
      // getPatientByChatId
      query.mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Тест', email: 'a@b.com' }] });

      const msg = { chat: { id: 111 } };
      await handlers.diary(msg);

      expect(mockSendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('Заполнение дневника'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array),
          }),
        })
      );
    });

    it('should show not linked message for unknown user', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const msg = { chat: { id: 999 } };
      await handlers.diary(msg);

      expect(mockSendMessage).toHaveBeenCalledWith(
        999,
        expect.stringContaining('не привязан'),
        expect.any(Object)
      );
    });
  });
});
