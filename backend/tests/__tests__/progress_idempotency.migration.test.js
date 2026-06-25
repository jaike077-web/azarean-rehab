// =====================================================
// Sanity-тест миграции 20260625_progress_idempotency
// (file-content проверки; функциональная idempotency-проверка — psql-цикл вручную)
// =====================================================
const fs = require('fs');
const path = require('path');

const MIG = fs.readFileSync(
  path.join(__dirname, '../../database/migrations/20260625_progress_idempotency.sql'),
  'utf8'
);

describe('migration 20260625_progress_idempotency', () => {
  it('partial UNIQUE индекс (complex_id, exercise_id, session_id) WHERE session_id IS NOT NULL', () => {
    expect(MIG).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_logs_idem/i);
    expect(MIG).toMatch(/\(complex_id, exercise_id, session_id\)/);
    expect(MIG).toMatch(/WHERE session_id IS NOT NULL/i);
  });

  it('дедуп существующих дублей перед индексом (прод-безопасность)', () => {
    expect(MIG).toMatch(/DELETE FROM progress_logs/i);
    expect(MIG).toMatch(/a\.id < b\.id/); // оставляем самую свежую строку
  });

  it('идемпотентна (IF NOT EXISTS)', () => {
    expect(MIG).toMatch(/IF NOT EXISTS/i);
  });
});
