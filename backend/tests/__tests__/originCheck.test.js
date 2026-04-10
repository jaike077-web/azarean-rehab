// =====================================================
// TESTS: Origin-check middleware (CSRF protection)
// Важно: все остальные тесты обходят origin-check через NODE_ENV=test.
// Здесь мы явно отключаем bypass чтобы проверить реальную логику.
// =====================================================

// Временно меняем NODE_ENV чтобы включить middleware
const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

// Мокаем config с нашим списком разрешённых origins
jest.mock('../../config/config', () => ({
  nodeEnv: 'development',
  corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
}));

const { requireSameOrigin } = require('../../middleware/originCheck');

afterAll(() => {
  process.env.NODE_ENV = originalEnv;
});

const mkReq = (method, origin) => ({
  method,
  headers: origin ? { origin } : {},
});

const mkRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('requireSameOrigin middleware', () => {

  it('пропускает GET без Origin', () => {
    const req = mkReq('GET', null);
    const res = mkRes();
    const next = jest.fn();
    requireSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('пропускает HEAD и OPTIONS', () => {
    ['HEAD', 'OPTIONS'].forEach((method) => {
      const req = mkReq(method, null);
      const res = mkRes();
      const next = jest.fn();
      requireSameOrigin(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  it('пропускает POST без Origin в dev (CRA proxy не шлёт Origin)', () => {
    const req = mkReq('POST', null);
    const res = mkRes();
    const next = jest.fn();
    requireSameOrigin(req, res, next);
    // В development mode отсутствие Origin допускается
    // (CRA proxy strip'ает header). В production блокируется.
    expect(next).toHaveBeenCalled();
  });

  it('блокирует PUT/DELETE/PATCH с чужим Origin', () => {
    ['PUT', 'DELETE', 'PATCH', 'POST'].forEach((method) => {
      const req = mkReq(method, 'https://evil.com');
      const res = mkRes();
      const next = jest.fn();
      requireSameOrigin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  it('пропускает POST с разрешённым Origin (localhost:3000)', () => {
    const req = mkReq('POST', 'http://localhost:3000');
    const res = mkRes();
    const next = jest.fn();
    requireSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('пропускает POST с разрешённым Origin с путём (localhost:3000/something)', () => {
    const req = mkReq('POST', 'http://localhost:3000/dashboard');
    const res = mkRes();
    const next = jest.fn();
    requireSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('пропускает POST с Referer вместо Origin', () => {
    const req = {
      method: 'POST',
      headers: { referer: 'http://localhost:3001/patient-dashboard' },
    };
    const res = mkRes();
    const next = jest.fn();
    requireSameOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
