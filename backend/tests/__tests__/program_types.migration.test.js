// =====================================================
// TEST: миграция 20260512_program_types.sql
// Wave 1 commit 1.01 — фундамент multi-protocol
//
// Это sanity-тест миграционного SQL как текста: проверяет
// наличие ключевых элементов (CREATE TABLE, seed, FK, backfill).
// Реальное поведение проверяется через idempotency cycle:
//   createdb → schema.sql → миграции ×2 → SELECT → dropdb
// (см. DoD коммита 1.01).
// =====================================================

const fs = require('fs');
const path = require('path');

const MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../database/migrations/20260512_program_types.sql'),
  'utf8'
);

const SEED = fs.readFileSync(
  path.join(__dirname, '../../database/seeds/program_types.sql'),
  'utf8'
);

describe('20260512_program_types migration — структура SQL', () => {
  it('создаёт таблицу program_types через IF NOT EXISTS (идемпотентно)', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS program_types/i);
  });

  it('первичный ключ — code VARCHAR(50)', () => {
    expect(MIGRATION).toMatch(/code\s+VARCHAR\(50\)\s+PRIMARY KEY/i);
  });

  it('добавляет rehab_programs.program_type с DEFAULT acl', () => {
    expect(MIGRATION).toMatch(/ALTER TABLE rehab_programs[\s\S]*ADD COLUMN program_type[\s\S]*DEFAULT 'acl'/i);
  });

  it('ALTER ADD COLUMN обёрнут в DO-блок с column_exists проверкой (идемпотентно)', () => {
    expect(MIGRATION).toMatch(/information_schema\.columns[\s\S]*column_name = 'program_type'/);
  });

  it('FK fk_rehab_programs_program_type создаётся через DO-блок с проверкой существования', () => {
    expect(MIGRATION).toMatch(/fk_rehab_programs_program_type/);
    expect(MIGRATION).toMatch(/information_schema\.table_constraints[\s\S]*constraint_name = 'fk_rehab_programs_program_type'/);
    expect(MIGRATION).toMatch(/FOREIGN KEY \(program_type\) REFERENCES program_types\(code\)/i);
  });

  it('seed содержит 3 минимальных кода: acl, knee_general, shoulder_general', () => {
    expect(MIGRATION).toMatch(/'acl',\s*'ПКС реабилитация',\s*'knee',\s*TRUE/);
    expect(MIGRATION).toMatch(/'knee_general',\s*'Реабилитация колена',\s*'knee',\s*FALSE/);
    expect(MIGRATION).toMatch(/'shoulder_general',\s*'Реабилитация плеча',\s*'shoulder',\s*FALSE/);
  });

  it('seed использует ON CONFLICT DO NOTHING (идемпотентно)', () => {
    expect(MIGRATION).toMatch(/ON CONFLICT \(code\) DO NOTHING/i);
  });

  it('backfill — regex по diagnosis на плечевые маркеры → shoulder_general', () => {
    expect(MIGRATION).toMatch(/UPDATE rehab_programs[\s\S]*SET program_type = 'shoulder_general'/i);
    expect(MIGRATION).toMatch(/diagnosis ~\* '\(плеч\|shoulder\|манжет\|надостн\|cuff\|frozen\)'/);
  });

  it('обёрнута в транзакцию BEGIN/COMMIT', () => {
    expect(MIGRATION).toMatch(/^BEGIN;/m);
    expect(MIGRATION).toMatch(/^COMMIT;/m);
  });

  it('FK добавлен ПОСЛЕ seed (иначе backfill упадёт на пустой program_types)', () => {
    const seedPos = MIGRATION.search(/INSERT INTO program_types/i);
    const fkPos = MIGRATION.search(/fk_rehab_programs_program_type/);
    expect(seedPos).toBeGreaterThan(0);
    expect(fkPos).toBeGreaterThan(seedPos);
  });
});

describe('seeds/program_types.sql — повтор для re-create БД', () => {
  it('содержит те же 3 кода', () => {
    expect(SEED).toMatch(/'acl'/);
    expect(SEED).toMatch(/'knee_general'/);
    expect(SEED).toMatch(/'shoulder_general'/);
  });

  it('использует ON CONFLICT DO UPDATE (re-runnable при пересоздании)', () => {
    expect(SEED).toMatch(/ON CONFLICT \(code\) DO UPDATE/i);
  });
});
