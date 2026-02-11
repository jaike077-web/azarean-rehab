// =====================================================
// TESTS: Patient Authentication Middleware
// Sprint 0.1
// =====================================================

const jwt = require('jsonwebtoken');
const { authenticatePatient } = require('../../middleware/patientAuth');

const PATIENT_JWT_SECRET = 'test-patient-jwt-secret-32-chars!!!!';

/**
 * Helper function to create mock request object
 */
const createMockRequest = (authHeader = null) => {
  return {
    headers: authHeader ? { authorization: authHeader } : {}
  };
};

/**
 * Helper function to create mock response object
 */
const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * Helper function to create mock next function
 */
const createMockNext = () => jest.fn();

/**
 * Helper function to generate a valid JWT token
 */
const generateValidToken = (payload = {}) => {
  const defaultPayload = {
    id: 1,
    email: 'patient@test.com',
    full_name: 'Иван Иванов'
  };

  return jwt.sign(
    { ...defaultPayload, ...payload },
    PATIENT_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
};

/**
 * Helper function to generate an expired JWT token
 */
const generateExpiredToken = () => {
  return jwt.sign(
    { id: 1, email: 'patient@test.com', full_name: 'Иван Иванов' },
    PATIENT_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '-1h' } // Expired 1 hour ago
  );
};

describe('Patient Authentication Middleware', () => {

  describe('Missing Authorization Header', () => {

    test('returns 401 when no Authorization header is provided', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      authenticatePatient(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Требуется авторизация'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when Authorization header has "Bearer " but no token', () => {
      const req = createMockRequest('Bearer ');
      const res = createMockResponse();
      const next = createMockNext();

      authenticatePatient(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Требуется авторизация'
      });
      expect(next).not.toHaveBeenCalled();
    });

  });

  describe('Invalid Token', () => {

    test('returns 403 with "Недействительный токен" for invalid token', () => {
      const req = createMockRequest('Bearer invalid.token.here');
      const res = createMockResponse();
      const next = createMockNext();

      authenticatePatient(req, res, next);

      // jwt.verify is async with callback, need to wait
      setImmediate(() => {
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Forbidden',
          message: 'Недействительный токен'
        });
        expect(next).not.toHaveBeenCalled();
      });
    });

  });

  describe('Expired Token', () => {

    test('returns 403 with "Токен истек" for expired token', (done) => {
      const expiredToken = generateExpiredToken();
      const req = createMockRequest(`Bearer ${expiredToken}`);
      const res = createMockResponse();
      const next = createMockNext();

      authenticatePatient(req, res, next);

      // jwt.verify callback is asynchronous
      setImmediate(() => {
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Forbidden',
          message: 'Токен истек, выполните вход заново'
        });
        expect(next).not.toHaveBeenCalled();
        done();
      });
    });

  });

  describe('Valid Token', () => {

    test('calls next() and sets req.patient for valid token', (done) => {
      const validToken = generateValidToken();
      const req = createMockRequest(`Bearer ${validToken}`);
      const res = createMockResponse();
      const next = createMockNext();

      authenticatePatient(req, res, next);

      setImmediate(() => {
        expect(next).toHaveBeenCalled();
        expect(req.patient).toBeDefined();
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        done();
      });
    });

    test('sets correct payload in req.patient (id, email, full_name)', (done) => {
      const testPayload = {
        id: 42,
        email: 'test.patient@example.com',
        full_name: 'Петр Петров'
      };

      const validToken = generateValidToken(testPayload);
      const req = createMockRequest(`Bearer ${validToken}`);
      const res = createMockResponse();
      const next = createMockNext();

      authenticatePatient(req, res, next);

      setImmediate(() => {
        expect(next).toHaveBeenCalled();
        expect(req.patient).toBeDefined();
        expect(req.patient.id).toBe(testPayload.id);
        expect(req.patient.email).toBe(testPayload.email);
        expect(req.patient.full_name).toBe(testPayload.full_name);

        // Verify JWT standard fields are also present
        expect(req.patient.iat).toBeDefined(); // issued at
        expect(req.patient.exp).toBeDefined(); // expiration

        done();
      });
    });

  });

});
