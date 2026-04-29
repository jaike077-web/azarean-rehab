// =====================================================
// Тесты на utils/opsAlert.js — Telegram ops-bot уведомления
// =====================================================

const { sendOpsAlert, _resetState } = require('../../utils/opsAlert');

describe('sendOpsAlert', () => {
  let originalFetch;
  let fetchCalls;
  let consoleLogSpy;

  beforeEach(() => {
    _resetState();
    fetchCalls = [];
    originalFetch = global.fetch;
    global.fetch = jest.fn(async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, status: 200, text: async () => 'ok' };
    });
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.OPS_BOT_TOKEN;
    delete process.env.OPS_CHAT_ID;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleLogSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('noop когда token и chatId не заданы — пишет в console.log', async () => {
    // config закэширован при require, имитируем noop напрямую — наши env vars
    // в setup.js уже пусты для OPS_BOT_TOKEN/OPS_CHAT_ID
    await sendOpsAlert('test title', 'test body');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalled();
    const out = consoleLogSpy.mock.calls[0].join(' ');
    expect(out).toContain('test title');
    expect(out).toContain('test body');
  });

  it('не падает на пустом body', async () => {
    await expect(sendOpsAlert('only title')).resolves.toBeUndefined();
  });

  it('дедуп: одинаковый title+первая строка не шлётся повторно', async () => {
    // принудительно ставим token/chatId через mock config
    jest.resetModules();
    process.env.OPS_BOT_TOKEN = 'fake-token';
    process.env.OPS_CHAT_ID = '12345';
    const { sendOpsAlert: fresh, _resetState: freshReset } = require('../../utils/opsAlert');
    freshReset();

    await fresh('Same title', 'first line\nsecond line');
    await fresh('Same title', 'first line\ndifferent second');
    await fresh('Different title', 'whatever');

    // первый и третий проходят, второй задедуплен
    expect(global.fetch).toHaveBeenCalledTimes(2);

    delete process.env.OPS_BOT_TOKEN;
    delete process.env.OPS_CHAT_ID;
  });

  it('hourly cap: после 30 алертов начинает подавлять', async () => {
    jest.resetModules();
    process.env.OPS_BOT_TOKEN = 'fake-token';
    process.env.OPS_CHAT_ID = '12345';
    const { sendOpsAlert: fresh, _resetState: freshReset } = require('../../utils/opsAlert');
    freshReset();

    for (let i = 0; i < 35; i++) {
      // меняем title чтобы не задедупилось
      await fresh(`Unique title #${i}`, `body line for ${i}`);
    }
    // 30 нормальных алертов + 1 служебная нотификация о rate-limit
    // (срабатывает на 31-м, потому что lastSuppressedNoticeAt стартует с 0,
    // а потом замолкает на 10 мин). Остальные 4 — тихий drop.
    expect(global.fetch).toHaveBeenCalledTimes(31);
    const lastCallBody = JSON.parse(global.fetch.mock.calls[30][1].body);
    expect(lastCallBody.text).toContain('rate-limit');
    expect(lastCallBody.text).toContain('Подавлено');

    delete process.env.OPS_BOT_TOKEN;
    delete process.env.OPS_CHAT_ID;
  });

  it('truncate длинного text до 4000 символов в payload', async () => {
    jest.resetModules();
    process.env.OPS_BOT_TOKEN = 'fake-token';
    process.env.OPS_CHAT_ID = '12345';
    const { sendOpsAlert: fresh, _resetState: freshReset } = require('../../utils/opsAlert');
    freshReset();

    const longBody = 'X'.repeat(10000);
    await fresh('big', longBody);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.text.length).toBeLessThanOrEqual(4000);

    delete process.env.OPS_BOT_TOKEN;
    delete process.env.OPS_CHAT_ID;
  });
});
