// Sanity-тесты SQL-структуры миграции EA1 (Exercise Audio — звук упражнения).
// Правило 2026-05-13: mock-based, без реальной БД (idempotency cycle — отдельно через psql).
// ТЗ: SESSION_HANDOFF_2026-06-01_EA_EXERCISE_AUDIO.md, чекпойнт EA1.
const fs = require('fs');
const path = require('path');

describe('EA1 exercise_audio migration — SQL sanity', () => {
  const migrationPath = path.join(
    __dirname,
    '../../database/migrations/20260601_exercise_audio.sql',
  );
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('audio_presets.kind: VARCHAR(16) NOT NULL DEFAULT cue + CHECK (cue|track)', () => {
    expect(sql).toMatch(/ADD COLUMN kind VARCHAR\(16\) NOT NULL DEFAULT 'cue'/);
    expect(sql).toMatch(
      /chk_audio_presets_kind[\s\S]*?CHECK \(kind IN \('cue', 'track'\)\)/,
    );
  });

  it('exercises: audio_preset_id FK → audio_presets ON DELETE SET NULL', () => {
    expect(sql).toMatch(
      /ALTER TABLE exercises\s+ADD COLUMN audio_preset_id INTEGER REFERENCES audio_presets\(id\) ON DELETE SET NULL/,
    );
  });

  it('exercises: audio_loop BOOLEAN NOT NULL DEFAULT false', () => {
    expect(sql).toMatch(
      /ALTER TABLE exercises\s+ADD COLUMN audio_loop BOOLEAN NOT NULL DEFAULT false/,
    );
  });

  it('complex_exercises: audio_preset_id FK → audio_presets ON DELETE SET NULL', () => {
    expect(sql).toMatch(
      /ALTER TABLE complex_exercises\s+ADD COLUMN audio_preset_id INTEGER REFERENCES audio_presets\(id\) ON DELETE SET NULL/,
    );
  });

  it('complex_exercises: audio_loop + audio_off BOOLEAN NOT NULL DEFAULT false', () => {
    expect(sql).toMatch(
      /ALTER TABLE complex_exercises\s+ADD COLUMN audio_loop BOOLEAN NOT NULL DEFAULT false/,
    );
    expect(sql).toMatch(
      /ALTER TABLE complex_exercises\s+ADD COLUMN audio_off BOOLEAN NOT NULL DEFAULT false/,
    );
  });

  it('complex_exercises: CHECK chk_ce_audio_off_no_preset (off ⇒ preset NULL)', () => {
    expect(sql).toMatch(
      /chk_ce_audio_off_no_preset[\s\S]*?CHECK \(NOT \(audio_off AND audio_preset_id IS NOT NULL\)\)/,
    );
  });

  it('complex_exercises: CHECK chk_ce_audio_off_no_loop (off ⇒ loop false)', () => {
    expect(sql).toMatch(
      /chk_ce_audio_off_no_loop[\s\S]*?CHECK \(NOT \(audio_off AND audio_loop\)\)/,
    );
  });

  it('оба FK на audio_presets — SET NULL (не RESTRICT как cue-bindings)', () => {
    // Считаем только реальные ADD COLUMN-стейтменты (в комментариях нет "ADD COLUMN").
    const setNullRefs =
      sql.match(/ADD COLUMN audio_preset_id INTEGER REFERENCES audio_presets\(id\) ON DELETE SET NULL/g) || [];
    expect(setNullRefs.length).toBe(2); // exercises + complex_exercises
    expect(sql).not.toMatch(/ON DELETE RESTRICT/);
  });

  it('индексы на оба preset_id FK (usage_count + SET NULL scan)', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_exercises_audio_preset/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_ce_audio_preset/);
  });

  it('идемпотентность — каждая ADD COLUMN под information_schema exists-guard', () => {
    // Колонок добавляем 6: kind, exercises(2), complex_exercises(3).
    const addColStmts = sql.match(/ADD COLUMN /g) || [];
    expect(addColStmts.length).toBe(6);
    // Гард-проверок на information_schema.columns должно быть >= число DO-блоков с колонками.
    const colGuards = sql.match(/information_schema\.columns/g) || [];
    expect(colGuards.length).toBeGreaterThanOrEqual(6);
  });

  it('идемпотентность — CHECK-constraints под pg_constraint exists-guard', () => {
    // "ADD CONSTRAINT chk_" встречается только в реальных стейтментах, не в комментариях.
    const addChecks = sql.match(/ADD CONSTRAINT chk_/g) || [];
    expect(addChecks.length).toBe(3); // kind + ce_audio_off_no_preset + ce_audio_off_no_loop
    // Каждая добавляемая CHECK защищена exists-guard'ом (conrelid появляется только в DO-блоках).
    const conrelidGuards = sql.match(/AND conrelid = '[a-z_]+'::regclass/g) || [];
    expect(conrelidGuards.length).toBe(3);
  });

  it('аддитивность — нет DROP COLUMN / DROP TABLE / DROP CONSTRAINT', () => {
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP CONSTRAINT/i);
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;/m);
  });
});
