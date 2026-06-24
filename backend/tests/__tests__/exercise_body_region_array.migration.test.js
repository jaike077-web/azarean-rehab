// Sanity-тесты SQL миграции body_region VARCHAR(50) → TEXT[] (2026-06-24).
// Правило: mock-based, без реальной БД (idempotency cycle делается отдельно через psql).
const fs = require('fs');
const path = require('path');

describe('exercises.body_region → TEXT[] migration — SQL sanity', () => {
  const migrationPath = path.join(
    __dirname,
    '../../database/migrations/20260624_exercise_body_region_to_array.sql'
  );
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('конверсия типа в TEXT[] через ALTER COLUMN ... TYPE', () => {
    expect(sql).toMatch(/ALTER COLUMN body_region TYPE TEXT\[\]/);
  });

  it('идемпотентна: DO block + data_type guard (character varying)', () => {
    expect(sql).toMatch(/information_schema\.columns/);
    expect(sql).toMatch(/v_column_type\s*=\s*'character varying'/);
  });

  it('USING: NULL/пусто → NULL, иначе ARRAY[btrim(...)] (1-эл. массив)', () => {
    expect(sql).toMatch(/USING/);
    expect(sql).toMatch(/ARRAY\[btrim\(body_region\)\]/);
  });

  it('старый btree-индекс дропается ДО ALTER TYPE', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_exercises_body_region/);
  });

  it('создаёт GIN-индекс для array-containment', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_exercises_body_region ON exercises USING gin \(body_region\)/);
  });

  it('CHECK — форма (непустой массив, без пустых элементов), БЕЗ whitelist значений', () => {
    expect(sql).toMatch(/ADD CONSTRAINT chk_exercises_body_region/);
    expect(sql).toMatch(/COALESCE\(array_length\(body_region, 1\), 0\) > 0/);
    expect(sql).toMatch(/NOT \(''\s*=\s*ANY\(body_region\)\)/);
    // НЕ должно быть whitelist'а кодов (легаси содержит свободный текст из CSV).
    expect(sql).not.toMatch(/<@\s*ARRAY\['shoulder'/);
  });

  it('CHECK допускает NULL (= «регион не указан»)', () => {
    expect(sql).toMatch(/body_region IS NULL OR/);
  });

  it('транзакционна (BEGIN/COMMIT)', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });
});
