// =====================================================
// HF#11 — measurement_session_id INTEGER → BIGINT
// Sanity SQL pattern tests (миграция statically inspected)
// =====================================================

const fs = require('fs');
const path = require('path');

describe('HF#11 — measurement_session_id BIGINT migration SQL sanity', () => {
  const migrationPath = path.join(
    __dirname,
    '../../database/migrations/20260519_session_id_bigint.sql'
  );
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('ALTER COLUMN TYPE BIGINT для rom_measurements', () => {
    expect(sql).toMatch(
      /ALTER TABLE rom_measurements[\s\S]+?ALTER COLUMN measurement_session_id TYPE BIGINT/
    );
  });

  it('ALTER COLUMN TYPE BIGINT для girth_measurements', () => {
    expect(sql).toMatch(
      /ALTER TABLE girth_measurements[\s\S]+?ALTER COLUMN measurement_session_id TYPE BIGINT/
    );
  });

  it('идемпотентность — оба ALTER в DO-блоках с information_schema check', () => {
    const doBlocks = sql.match(/DO \$\$[\s\S]+?END \$\$;/g) || [];
    expect(doBlocks.length).toBe(2);
    doBlocks.forEach((block) => {
      expect(block).toMatch(/information_schema\.columns/);
      expect(block).toMatch(/data_type = 'integer'/);
    });
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;\s*$/);
  });
});
