// Sanity-тесты SQL-структуры миграции AA1 (Custom Audio админ-слой).
// Правило 2026-05-13: mock-based, без реальной БД (idempotency cycle — отдельно через psql).
// ТЗ: TZ_CUSTOM_AUDIO_ADMIN_PRESETS.md, чекпойнт AA1.
const fs = require('fs');
const path = require('path');

describe('AA1 audio_presets_and_bindings migration — SQL sanity', () => {
  const migrationPath = path.join(
    __dirname,
    '../../database/migrations/20260530b_audio_presets_and_bindings.sql',
  );
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('создаёт все 3 таблицы', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS audio_presets/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS audio_cue_defaults/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS complex_cue_sounds/);
  });

  it('audio_presets: ключевые колонки (cue-агностичная библиотека)', () => {
    expect(sql).toMatch(/id\s+SERIAL PRIMARY KEY/);
    expect(sql).toMatch(/name\s+VARCHAR\(120\) NOT NULL/);
    expect(sql).toMatch(/file_path\s+VARCHAR\(255\) NOT NULL/);
    expect(sql).toMatch(/mime_type\s+VARCHAR\(64\)\s+NOT NULL/);
    expect(sql).toMatch(/size_bytes\s+INTEGER\s+NOT NULL/);
    expect(sql).toMatch(/duration_ms\s+INTEGER/);
    expect(sql).toMatch(/is_active\s+BOOLEAN NOT NULL DEFAULT TRUE/);
  });

  it('audio_presets.created_by FK → users ON DELETE SET NULL (пресет переживает автора)', () => {
    expect(sql).toMatch(/created_by\s+INTEGER REFERENCES users\(id\) ON DELETE SET NULL/);
  });

  it('audio_cue_defaults: cue_name PK + CHECK 5 cue CP1', () => {
    expect(sql).toMatch(/cue_name\s+VARCHAR\(32\) PRIMARY KEY/);
    expect(sql).toMatch(
      /chk_audio_cue_defaults_cue_name[\s\S]*?CHECK \(cue_name IN \('count_tick', 'set_start', 'set_end', 'rest_end', 'tempo_tick'\)\)/,
    );
  });

  it('audio_cue_defaults: is_locked дефолт FALSE (пациент перебивает по умолчанию)', () => {
    expect(sql).toMatch(/is_locked\s+BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it('complex_cue_sounds: complex_id FK → complexes ON DELETE CASCADE', () => {
    expect(sql).toMatch(
      /complex_id INTEGER NOT NULL REFERENCES complexes\(id\) ON DELETE CASCADE/,
    );
  });

  it('complex_cue_sounds: preset_id FK → audio_presets ON DELETE RESTRICT (409-паттерн)', () => {
    // Оба места ссылки на пресет должны быть RESTRICT (нельзя hard-delete используемый пресет).
    const restrictRefs = sql.match(/preset_id\s+INTEGER REFERENCES audio_presets\(id\) ON DELETE RESTRICT/g) || [];
    expect(restrictRefs.length).toBe(2); // defaults + complex bindings
  });

  it('complex_cue_sounds: UNIQUE(complex_id, cue_name)', () => {
    expect(sql).toMatch(/uq_complex_cue_sounds_complex_cue[\s\S]*?UNIQUE \(complex_id, cue_name\)/);
  });

  it('complex_cue_sounds: CHECK 5 cue CP1', () => {
    expect(sql).toMatch(
      /chk_complex_cue_sounds_cue_name[\s\S]*?CHECK \(cue_name IN \('count_tick', 'set_start', 'set_end', 'rest_end', 'tempo_tick'\)\)/,
    );
  });

  it('идемпотентность — все CREATE TABLE имеют IF NOT EXISTS', () => {
    // ^CREATE с /m ловит только реальные стейтменты (комментарии начинаются с "--").
    const createTableStmts = sql.match(/^CREATE TABLE[^\n]*/gm) || [];
    expect(createTableStmts.length).toBe(3);
    createTableStmts.forEach((stmt) => {
      expect(stmt).toMatch(/CREATE TABLE IF NOT EXISTS/);
    });
  });

  it('идемпотентность — индекс с IF NOT EXISTS', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_complex_cue_sounds_preset/);
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;/m);
  });
});
