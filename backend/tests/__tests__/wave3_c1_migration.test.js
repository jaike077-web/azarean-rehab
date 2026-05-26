// =====================================================
// TEST: миграция 20260526_instructor_assignment_and_cadence.sql
// Wave 3 C1 — instructor assignment + complex cadence (foundation)
//
// Sanity-тест миграционного SQL как текста: проверяет наличие
// ключевых элементов (ADD COLUMN, индекс, бэкфилл, CHECK).
// Реальное поведение проверяется через idempotency cycle и live
// verify-step в commit-отчёте (см. TZ_WAVE_3_C1).
// =====================================================

const fs = require('fs');
const path = require('path');

const MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../database/migrations/20260526_instructor_assignment_and_cadence.sql'),
  'utf8'
);

describe('20260526_instructor_assignment_and_cadence — структура SQL', () => {
  it('обёрнута в транзакцию BEGIN/COMMIT', () => {
    expect(MIGRATION).toMatch(/^BEGIN;/m);
    expect(MIGRATION).toMatch(/^COMMIT;/m);
  });

  it('добавляет patients.assigned_instructor_id через ADD COLUMN IF NOT EXISTS (идемпотентно)', () => {
    expect(MIGRATION).toMatch(/ALTER TABLE patients[\s\S]*ADD COLUMN IF NOT EXISTS assigned_instructor_id INTEGER/i);
  });

  it('assigned_instructor_id ссылается на users(id) ON DELETE SET NULL', () => {
    expect(MIGRATION).toMatch(/REFERENCES users\(id\) ON DELETE SET NULL/i);
  });

  it('создаёт partial индекс idx_patients_assigned_instructor WHERE is_active=true', () => {
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS idx_patients_assigned_instructor/i);
    expect(MIGRATION).toMatch(/ON patients \(assigned_instructor_id\) WHERE is_active = true/i);
  });

  it('бэкфилл: последний активный комплекс → его instructor_id, fallback created_by', () => {
    expect(MIGRATION).toMatch(/UPDATE patients p[\s\S]*SET assigned_instructor_id = COALESCE/i);
    expect(MIGRATION).toMatch(/SELECT c\.instructor_id[\s\S]*FROM complexes c/i);
    expect(MIGRATION).toMatch(/ORDER BY c\.created_at DESC[\s\S]*LIMIT 1/i);
    expect(MIGRATION).toMatch(/p\.created_by/);
  });

  it('бэкфилл идемпотентен — UPDATE только где assigned_instructor_id IS NULL', () => {
    expect(MIGRATION).toMatch(/WHERE p\.assigned_instructor_id IS NULL/i);
  });

  it('добавляет complexes.target_min/target_max/target_unit через ADD COLUMN IF NOT EXISTS', () => {
    expect(MIGRATION).toMatch(/ALTER TABLE complexes[\s\S]*ADD COLUMN IF NOT EXISTS target_min\s+SMALLINT/i);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS target_max\s+SMALLINT/i);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS target_unit VARCHAR\(10\)/i);
  });

  it('CHECK chk_complexes_cadence — DROP IF EXISTS перед ADD (идемпотентно)', () => {
    expect(MIGRATION).toMatch(/ALTER TABLE complexes DROP CONSTRAINT IF EXISTS chk_complexes_cadence/i);
    expect(MIGRATION).toMatch(/ALTER TABLE complexes ADD CONSTRAINT chk_complexes_cadence CHECK/i);
  });

  it('CHECK: все три NULL ИЛИ все три заданы + min>=1, max>=min, unit ∈ {day,week}', () => {
    // Ветка all-NULL
    expect(MIGRATION).toMatch(/target_min IS NULL AND target_max IS NULL AND target_unit IS NULL/i);
    // Ветка all-set + min>=1
    expect(MIGRATION).toMatch(/target_min IS NOT NULL AND target_max IS NOT NULL AND target_unit IS NOT NULL/i);
    expect(MIGRATION).toMatch(/target_min >= 1/);
    expect(MIGRATION).toMatch(/target_max >= target_min/);
    // unit whitelist
    expect(MIGRATION).toMatch(/target_unit IN \('day', 'week'\)/i);
  });

  it('verification queries присутствуют в комментариях для post-apply ручной проверки', () => {
    expect(MIGRATION).toMatch(/Verification queries/i);
    expect(MIGRATION).toMatch(/information_schema\.columns/);
    expect(MIGRATION).toMatch(/pg_get_constraintdef/);
  });
});
