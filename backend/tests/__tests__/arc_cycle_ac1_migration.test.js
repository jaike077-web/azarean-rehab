// =====================================================
// TEST: миграция 20260531_program_blocks.sql
// ARC-CYCLE AC1 — микроцикл-слой (program_blocks + program_block_complexes)
//
// Sanity-тест миграционного SQL как текста: проверяет наличие ключевых
// элементов (CREATE TABLE, FK, CHECK, UNIQUE, индексы, идемпотентность).
// Реальное поведение (negative CHECK INSERTs) проверяется через idempotency
// cycle + live verify-step в commit-отчёте AC1 (TZ_ARC_CYCLE_MICROCYCLE).
// =====================================================

const fs = require('fs');
const path = require('path');

const MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../database/migrations/20260531_program_blocks.sql'),
  'utf8'
);

describe('20260531_program_blocks — структура SQL', () => {
  it('обёрнута в транзакцию BEGIN/COMMIT', () => {
    expect(MIGRATION).toMatch(/^BEGIN;/m);
    expect(MIGRATION).toMatch(/^COMMIT;/m);
  });

  it('создаёт program_blocks через CREATE TABLE IF NOT EXISTS (идемпотентно)', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS program_blocks/i);
  });

  it('program_blocks.program_id → rehab_programs(id) ON DELETE CASCADE', () => {
    expect(MIGRATION).toMatch(/program_id\s+INTEGER NOT NULL REFERENCES rehab_programs\(id\) ON DELETE CASCADE/i);
  });

  it('program_blocks несёт цель (target_min/max/unit) + ротацию (current_day_index, current_day_started_at, last_advanced_session_id)', () => {
    expect(MIGRATION).toMatch(/target_min\s+SMALLINT/i);
    expect(MIGRATION).toMatch(/target_max\s+SMALLINT/i);
    expect(MIGRATION).toMatch(/target_unit\s+VARCHAR\(10\)/i);
    expect(MIGRATION).toMatch(/current_day_index\s+SMALLINT/i);
    expect(MIGRATION).toMatch(/current_day_started_at\s+TIMESTAMP/i);
    expect(MIGRATION).toMatch(/last_advanced_session_id\s+BIGINT/i);
  });

  it('chk_block_type — enum gymnastics/training через DO + pg_constraint exists-check', () => {
    expect(MIGRATION).toMatch(/conname = 'chk_block_type'/);
    expect(MIGRATION).toMatch(/CHECK \(block_type IN \('gymnastics', 'training'\)\)/i);
  });

  it('chk_block_cadence — всё-NULL или всё-задано + min>=1, max>=min + per-type unit', () => {
    expect(MIGRATION).toMatch(/conname = 'chk_block_cadence'/);
    expect(MIGRATION).toMatch(/target_min IS NULL AND target_max IS NULL AND target_unit IS NULL/i);
    expect(MIGRATION).toMatch(/target_min >= 1/);
    expect(MIGRATION).toMatch(/target_max >= target_min/);
    // per-type unit: gymnastics→day, training→week
    expect(MIGRATION).toMatch(/block_type = 'gymnastics' AND target_unit = 'day'/i);
    expect(MIGRATION).toMatch(/block_type = 'training'\s+AND target_unit = 'week'/i);
  });

  it('chk_block_rotation — current_day_index только у training', () => {
    expect(MIGRATION).toMatch(/conname = 'chk_block_rotation'/);
    expect(MIGRATION).toMatch(/CHECK \(block_type = 'training' OR current_day_index IS NULL\)/i);
  });

  it('создаёт program_block_complexes с FK CASCADE + UNIQUE(block_id, complex_id)', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS program_block_complexes/i);
    expect(MIGRATION).toMatch(/block_id\s+INTEGER NOT NULL REFERENCES program_blocks\(id\) ON DELETE CASCADE/i);
    expect(MIGRATION).toMatch(/complex_id INTEGER NOT NULL REFERENCES complexes\(id\) ON DELETE CASCADE/i);
    expect(MIGRATION).toMatch(/UNIQUE \(block_id, complex_id\)/i);
  });

  it('program_block_complexes.day_index nullable (gymnastics плоский) + label', () => {
    expect(MIGRATION).toMatch(/day_index\s+SMALLINT/i);
    expect(MIGRATION).toMatch(/label\s+VARCHAR\(100\)/i);
  });

  it('индексы: partial на program_blocks(program_id) WHERE is_active + pbc(block_id, day_index)', () => {
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS idx_program_blocks_program[\s\S]*ON program_blocks \(program_id\) WHERE is_active = true/i);
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS idx_pbc_block_day[\s\S]*ON program_block_complexes \(block_id, day_index\)/i);
  });

  it('verification queries присутствуют в комментариях для post-apply проверки (Rule #15)', () => {
    expect(MIGRATION).toMatch(/Verification queries/i);
    expect(MIGRATION).toMatch(/pg_get_constraintdef/);
  });
});
