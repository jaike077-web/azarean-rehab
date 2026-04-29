// =====================================================
// Тесты на utils/email.js — two-tier Y360 → Resend → stub
// =====================================================

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

jest.mock('resend', () => ({
  Resend: jest.fn(),
}));

const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// Helper для перезагрузки email.js со свежим env
function loadEmailModule() {
  jest.resetModules();
  // Re-mock после resetModules — ссылки выше остались валидными
  jest.doMock('nodemailer', () => ({ createTransport: nodemailer.createTransport }));
  jest.doMock('resend', () => ({ Resend }));
  return require('../../utils/email');
}

describe('utils/email — two-tier Y360 → Resend', () => {
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    delete process.env.YANDEX_SMTP_USER;
    delete process.env.YANDEX_SMTP_PASSWORD;
    delete process.env.RESEND_API_KEY;

    nodemailer.createTransport.mockReset();
    Resend.mockReset();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Tier 3 stub: ни Y360 ни Resend не сконфигурены → console log + success', async () => {
    const { send } = loadEmailModule();
    const result = await send('to@example.com', {
      subject: 'Test',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(result.success).toBe(true);
    expect(result.stub).toBe(true);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(Resend).not.toHaveBeenCalled();
    // Stub печатает в console
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  test('Tier 1: Y360 успех → Resend не вызывается', async () => {
    process.env.YANDEX_SMTP_USER = 'noreply@my.azarean.ru';
    process.env.YANDEX_SMTP_PASSWORD = 'fake-app-pwd';

    const sendMail = jest.fn().mockResolvedValue({ messageId: 'y360-id-123' });
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const { send } = loadEmailModule();
    const result = await send('to@example.com', {
      subject: 'Test',
      html: '<p>x</p>',
      text: 'x',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('y360');
    expect(result.id).toBe('y360-id-123');
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: expect.stringContaining('noreply@my.azarean.ru'),
      to: 'to@example.com',
      subject: 'Test',
    }));
    // Resend SDK даже не инициализирован
    expect(Resend).not.toHaveBeenCalled();
  });

  test('Tier 1 fail → Tier 2 Resend подхватывает', async () => {
    process.env.YANDEX_SMTP_USER = 'noreply@my.azarean.ru';
    process.env.YANDEX_SMTP_PASSWORD = 'fake-app-pwd';
    process.env.RESEND_API_KEY = 're_fakekey';

    const sendMail = jest.fn().mockRejectedValue(new Error('connection timeout'));
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const resendSend = jest.fn().mockResolvedValue({
      data: { id: 'resend-id-456' },
      error: null,
    });
    Resend.mockImplementation(() => ({ emails: { send: resendSend } }));

    const { send } = loadEmailModule();
    const result = await send('to@example.com', {
      subject: 'Test',
      html: '<p>x</p>',
      text: 'x',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('resend');
    expect(result.id).toBe('resend-id-456');
    expect(sendMail).toHaveBeenCalled();
    expect(resendSend).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Y360 failed'));
  });

  test('Tier 1 + Tier 2 оба упали → success=false + errors[]', async () => {
    process.env.YANDEX_SMTP_USER = 'noreply@my.azarean.ru';
    process.env.YANDEX_SMTP_PASSWORD = 'fake-app-pwd';
    process.env.RESEND_API_KEY = 're_fakekey';

    nodemailer.createTransport.mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(new Error('smtp 5xx')),
    });
    Resend.mockImplementation(() => ({
      emails: {
        send: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'invalid api key' },
        }),
      },
    }));

    const { send } = loadEmailModule();
    const result = await send('to@example.com', {
      subject: 'Test',
      html: '<p>x</p>',
      text: 'x',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].provider).toBe('y360');
    expect(result.errors[1].provider).toBe('resend');
  });

  test('только Resend сконфигурен (нет Y360) → пишет через Resend', async () => {
    process.env.RESEND_API_KEY = 're_fakekey';

    const resendSend = jest.fn().mockResolvedValue({
      data: { id: 'r-1' },
      error: null,
    });
    Resend.mockImplementation(() => ({ emails: { send: resendSend } }));

    const { send } = loadEmailModule();
    const result = await send('to@example.com', { subject: 'X', html: '<p>x</p>', text: 'x' });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('resend');
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(resendSend).toHaveBeenCalled();
  });

  test('sendPasswordResetEmail формирует правильную ссылку', async () => {
    process.env.YANDEX_SMTP_USER = 'noreply@my.azarean.ru';
    process.env.YANDEX_SMTP_PASSWORD = 'fake-app-pwd';

    const sendMail = jest.fn().mockResolvedValue({ messageId: 'y' });
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const { sendPasswordResetEmail } = loadEmailModule();
    await sendPasswordResetEmail('user@example.com', 'reset-token-abc');

    expect(sendMail).toHaveBeenCalled();
    const args = sendMail.mock.calls[0][0];
    // Ссылка ведёт на /patient-reset-password/<token>
    expect(args.html).toContain('/patient-reset-password/reset-token-abc');
    expect(args.text).toContain('/patient-reset-password/reset-token-abc');
    expect(args.subject).toContain('сброс пароля');
  });

  test('lazy-init: транспорт не создаётся пока send не вызван', async () => {
    process.env.YANDEX_SMTP_USER = 'noreply@my.azarean.ru';
    process.env.YANDEX_SMTP_PASSWORD = 'fake-app-pwd';

    loadEmailModule();
    // require не должен сам триггерить createTransport
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});
