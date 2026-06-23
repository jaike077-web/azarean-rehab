// Sanity-тесты SQL-структуры миграции M2.1 (связь зон — patients.zone_link_note).
// Правило 2026-05-13: mock-based, без реальной БД (idempotency cycle — отдельно через psql).
const fs = require('fs');
const path = require('path');

describe('M2.1 patient_zone_link_note migration — SQL sanity', () => {
  const migrationPath = path.join(
    __dirname,
    '../../database/migrations/20260619_patient_zone_link_note.sql',
  );
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('добавляет колонку zone_link_note TEXT в patients', () => {
    expect(sql).toMatch(/ALTER TABLE patients/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS zone_link_note TEXT/);
  });

  it('аддитивна — не создаёт/не дропает таблицы, единственный ALTER', () => {
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    const alters = sql.match(/^ALTER TABLE[^\n]*/gm) || [];
    expect(alters.length).toBe(1);
  });

  it('идемпотентность — ADD COLUMN с IF NOT EXISTS', () => {
    const addCols = sql.match(/^\s*ADD COLUMN[^\n]*/gm) || [];
    expect(addCols.length).toBe(1);
    addCols.forEach((stmt) => {
      expect(stmt).toMatch(/ADD COLUMN IF NOT EXISTS/);
    });
  });

  it('nullable (без NOT NULL / без DEFAULT / без CHECK) — обычный свободный текст', () => {
    const addColLine = (sql.match(/ADD COLUMN IF NOT EXISTS zone_link_note[^\n;]*/) || [''])[0];
    expect(addColLine).not.toMatch(/NOT NULL/);
    expect(addColLine).not.toMatch(/DEFAULT/);
    // нет SQL-конструкции CHECK ( — слово «CHECK» в комментарии не считается
    expect(sql).not.toMatch(/CHECK\s*\(/i);
  });
});
