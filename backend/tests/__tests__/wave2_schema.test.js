// Sanity-тесты SQL-структуры миграции Wave 2 #2.01
// Правило 2026-05-13: mock-based, без реальной БД (idempotency cycle делается отдельно через psql)
const fs = require('fs');
const path = require('path');

describe('Wave 2 schema migration — SQL sanity', () => {
  const migrationPath = path.join(__dirname, '../../database/migrations/20260516_wave2_schema.sql');
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('создаёт все 7 таблиц Wave 2', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS rom_measurements/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS girth_measurements/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS pain_locations/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS pain_entries/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS pain_entry_locations/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS phase_transition_criteria/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS patient_criterion_answers/);
  });

  it('rom_measurements имеет 5 measured_by values', () => {
    expect(sql).toMatch(/measured_by VARCHAR\(20\) NOT NULL CHECK[\s\S]*?instructor_direct[\s\S]*?instructor_markup[\s\S]*?ai_assisted[\s\S]*?ai_unverified[\s\S]*?patient_self/);
  });

  it('rom_measurements CHECK ровно одно value_*', () => {
    expect(sql).toMatch(/CONSTRAINT rom_value_exactly_one CHECK/);
  });

  it('pain_entries CHECK vas_score 0-10', () => {
    expect(sql).toMatch(/vas_score SMALLINT NOT NULL CHECK \(vas_score BETWEEN 0 AND 10\)/);
  });

  it('pain_entries UNIQUE daily entry partial index', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_pain_daily_unique[\s\S]+WHERE is_event = FALSE/);
  });

  it('pain_locations FK на program_types', () => {
    expect(sql).toMatch(/program_type VARCHAR\(50\) NOT NULL REFERENCES program_types\(code\)/);
  });

  it('phase_transition_criteria три типа', () => {
    expect(sql).toMatch(/criterion_type VARCHAR\(20\) NOT NULL CHECK[\s\S]*?measurement[\s\S]*?self_report[\s\S]*?instructor_check/);
  });

  it('patient_criterion_answers consistency CHECK', () => {
    expect(sql).toMatch(/CONSTRAINT answer_by_user_consistency CHECK/);
  });

  it('ALTER patients добавляет 3 колонки', () => {
    expect(sql).toMatch(/ADD COLUMN measurement_reference_photo_url VARCHAR\(500\)/);
    expect(sql).toMatch(/ADD COLUMN photo_consent_at TIMESTAMP/);
    expect(sql).toMatch(/ADD COLUMN photo_consent_version VARCHAR\(20\)/);
  });

  it('идемпотентность — все CREATE TABLE имеют IF NOT EXISTS', () => {
    const createTableMatches = sql.match(/CREATE TABLE[\s\S]*?;/g) || [];
    expect(createTableMatches.length).toBeGreaterThanOrEqual(7);
    createTableMatches.forEach(stmt => {
      expect(stmt).toMatch(/CREATE TABLE IF NOT EXISTS/);
    });
  });

  it('идемпотентность — все ALTER в DO-блоках с информационной проверкой', () => {
    const alterMatches = sql.match(/ALTER TABLE patients ADD COLUMN[\s\S]*?;/g) || [];
    expect(alterMatches.length).toBeGreaterThanOrEqual(3);
    expect(sql).toMatch(/DO \$\$[\s\S]+?IF NOT EXISTS[\s\S]+?ADD COLUMN measurement_reference_photo_url/);
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;\s*$/);
  });

  it('все индексы IF NOT EXISTS', () => {
    const indexes = sql.match(/CREATE (?:UNIQUE )?INDEX[\s\S]*?;/g) || [];
    expect(indexes.length).toBeGreaterThanOrEqual(10);
    indexes.forEach(idx => {
      expect(idx).toMatch(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/);
    });
  });
});

describe('Wave 2 pain_locations seed (коммит 2.02)', () => {
  const seedPath = path.join(__dirname, '../../database/migrations/20260517_pain_locations_seed.sql');
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(seedPath, 'utf8');
  });

  it('16 INSERT строк (8 knee + 8 shoulder)', () => {
    const valuesMatches = sql.match(/^\s*\('[a-z_]+',/gm) || [];
    expect(valuesMatches.length).toBe(16);
  });

  it('содержит 2 red-flag локации', () => {
    expect(sql).toMatch(/'calf_posterior'[\s\S]+?TRUE/);
    expect(sql).toMatch(/'neck_lateral'[\s\S]+?TRUE/);
  });

  it('идемпотентность ON CONFLICT DO NOTHING для обоих INSERT блоков', () => {
    const onConflictMatches = sql.match(/ON CONFLICT \(code\) DO NOTHING/g) || [];
    expect(onConflictMatches.length).toBe(2);
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;\s*$/);
  });

  it('red-flag locations имеют клинически информативные red_flag_reason', () => {
    expect(sql).toMatch(/'calf_posterior'[\s\S]+?'Возможный тромбоз/);
    expect(sql).toMatch(/'neck_lateral'[\s\S]+?'Возможная цервикальная радикулопатия/);
  });
});
