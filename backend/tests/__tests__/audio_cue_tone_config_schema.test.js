// Sanity-тесты SQL-структуры миграции CT1 (редактор «Стандартного тона»).
// Правило 2026-05-13: mock-based, без реальной БД (idempotency cycle — отдельно через psql).
// ТЗ: SESSION_HANDOFF_2026-06-02_CUSTOM_TONE_EDITOR.md, чекпойнт CT1.
const fs = require('fs');
const path = require('path');

describe('CT1 audio_cue_tone_config migration — SQL sanity', () => {
  const migrationPath = path.join(
    __dirname,
    '../../database/migrations/20260602_audio_cue_tone_config.sql',
  );
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('добавляет колонку tone_config JSONB в audio_cue_defaults', () => {
    expect(sql).toMatch(/ALTER TABLE audio_cue_defaults/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS tone_config JSONB/);
  });

  it('аддитивна — НЕ создаёт/не дропает таблицы, не трогает существующие колонки', () => {
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    // единственный ALTER — ADD COLUMN tone_config
    const alters = sql.match(/^ALTER TABLE[^\n]*/gm) || [];
    expect(alters.length).toBe(1);
  });

  it('идемпотентность — ADD COLUMN c IF NOT EXISTS', () => {
    // ^\s*ADD COLUMN с /m ловит только реальный стейтмент (в комментариях
    // "ADD COLUMN" стоит в середине строки после "-- …(", не у начала строки).
    const addCols = sql.match(/^\s*ADD COLUMN[^\n]*/gm) || [];
    expect(addCols.length).toBe(1);
    addCols.forEach((stmt) => {
      expect(stmt).toMatch(/ADD COLUMN IF NOT EXISTS/);
    });
  });

  it('nullable (без NOT NULL / без DEFAULT) — существующие строки не сломаны', () => {
    // строка с ADD COLUMN не должна содержать NOT NULL или DEFAULT
    const addColLine = (sql.match(/ADD COLUMN IF NOT EXISTS tone_config[^\n;]*/) || [''])[0];
    expect(addColLine).not.toMatch(/NOT NULL/);
    expect(addColLine).not.toMatch(/DEFAULT/);
  });

  it('документирует колонку через COMMENT', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN audio_cue_defaults\.tone_config/);
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;/m);
  });
});
