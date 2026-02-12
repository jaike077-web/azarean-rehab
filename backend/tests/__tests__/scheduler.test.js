// =====================================================
// TESTS: Scheduler Service
// Sprint 3 — Telegram-бот
// =====================================================

// Mock db
jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
}));

// Mock telegramBot
jest.mock('../../services/telegramBot', () => ({
  sendTelegramMessage: jest.fn().mockResolvedValue(true),
  initBot: jest.fn(),
  getBot: jest.fn(),
}));

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({ stop: jest.fn() }),
}));

const { query } = require('../../database/db');
const { sendTelegramMessage } = require('../../services/telegramBot');

// Import the functions we want to test
const {
  sendExerciseReminders,
  sendDiaryReminders,
  sendDailyTip,
} = require('../../services/scheduler');

// =====================================================
// SETUP
// =====================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// sendExerciseReminders
// =====================================================
describe('sendExerciseReminders', () => {

  it('should send reminders to patients with matching reminder_time', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { telegram_chat_id: 111, full_name: 'Пациент 1' },
        { telegram_chat_id: 222, full_name: 'Пациент 2' },
      ],
    });

    await sendExerciseReminders();

    expect(query).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      111,
      expect.stringContaining('Пациент 1')
    );
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      222,
      expect.stringContaining('Пациент 2')
    );
  });

  it('should not send when no patients match', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await sendExerciseReminders();

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});

// =====================================================
// sendDiaryReminders
// =====================================================
describe('sendDiaryReminders', () => {

  it('should send reminders only to patients who have not filled diary', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { telegram_chat_id: 333, full_name: 'Незаполненный' },
      ],
    });

    await sendDiaryReminders();

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      333,
      expect.stringContaining('заполнить дневник')
    );
  });

  it('should not send when all patients filled diary', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await sendDiaryReminders();

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('should pass today date in query', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await sendDiaryReminders();

    const today = new Date().toISOString().split('T')[0];
    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      [today]
    );
  });
});

// =====================================================
// sendDailyTip
// =====================================================
describe('sendDailyTip', () => {

  it('should send tips to patients with active programs', async () => {
    // First query: get patients
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, telegram_chat_id: 444, current_phase: 1 },
      ],
    });
    // Second query: get tip for patient
    query.mockResolvedValueOnce({
      rows: [{ title: 'Совет дня', body: 'Текст совета', icon: '💡' }],
    });

    await sendDailyTip();

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      444,
      expect.stringContaining('Совет дня')
    );
  });

  it('should not send when no patients have telegram', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await sendDailyTip();

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('should handle multiple patients', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, telegram_chat_id: 100, current_phase: 1 },
        { id: 2, telegram_chat_id: 200, current_phase: 2 },
      ],
    });
    // Tip for patient 1
    query.mockResolvedValueOnce({
      rows: [{ title: 'Совет 1', body: 'Текст 1', icon: '💪' }],
    });
    // Tip for patient 2
    query.mockResolvedValueOnce({
      rows: [{ title: 'Совет 2', body: 'Текст 2', icon: '🏋️' }],
    });

    await sendDailyTip();

    expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
  });

  it('should skip patient if no tip found', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, telegram_chat_id: 100, current_phase: 99 }],
    });
    // No tips for this phase
    query.mockResolvedValueOnce({ rows: [] });

    await sendDailyTip();

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
