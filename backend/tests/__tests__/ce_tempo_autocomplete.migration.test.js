// =====================================================
// TEST: миграция 20260527_ce_tempo_autocomplete.sql (CP2a)
//
// Sanity-тест миграционного SQL как текста (по образцу
// program_types.migration.test.js). Реальное поведение
// (idempotency cycle, CHECK enforcement) проверяется через
// прогон в изолированной test-БД — см. отчёт CP2a (9 INSERT'ов).
// =====================================================

const fs = require('fs');
const path = require('path');

const MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../database/migrations/20260527_ce_tempo_autocomplete.sql'),
  'utf8'
);

describe('20260527_ce_tempo_autocomplete — структура SQL', () => {
  it('обёрнута в транзакцию BEGIN/COMMIT', () => {
    expect(MIGRATION).toMatch(/^BEGIN;/m);
    expect(MIGRATION).toMatch(/^COMMIT;/m);
  });

  describe('Шаг 1 — backfill пустых строк (идемпотентен)', () => {
    it('UPDATE reps=10 WHERE reps IS NULL AND duration_seconds IS NULL', () => {
      expect(MIGRATION).toMatch(/UPDATE complex_exercises[\s\S]*SET reps = 10[\s\S]*WHERE reps IS NULL[\s\S]*AND duration_seconds IS NULL/);
    });

    it('backfill ВЫЗВАН ДО добавления chk_ce_has_prescription', () => {
      const backfillPos = MIGRATION.search(/UPDATE complex_exercises\s+SET reps = 10/);
      // Ищем именно ADD CONSTRAINT (не упоминание в шапке-комментарии)
      const checkPos = MIGRATION.search(/ADD CONSTRAINT chk_ce_has_prescription/);
      expect(backfillPos).toBeGreaterThan(0);
      expect(checkPos).toBeGreaterThan(backfillPos);
    });
  });

  describe('Шаг 2 — auto_complete BOOLEAN NOT NULL DEFAULT true', () => {
    it('ADD COLUMN auto_complete с DEFAULT true', () => {
      expect(MIGRATION).toMatch(/ADD COLUMN auto_complete BOOLEAN NOT NULL DEFAULT true/i);
    });

    it('обёрнут в DO + information_schema check (идемпотентно)', () => {
      expect(MIGRATION).toMatch(/information_schema\.columns[\s\S]*column_name = 'auto_complete'/);
    });
  });

  describe('Шаг 3 — tempo_* SMALLINT nullable (3 колонки)', () => {
    it('ADD COLUMN tempo_eccentric_s SMALLINT', () => {
      expect(MIGRATION).toMatch(/ADD COLUMN tempo_eccentric_s SMALLINT/i);
    });
    it('ADD COLUMN tempo_pause_s SMALLINT', () => {
      expect(MIGRATION).toMatch(/ADD COLUMN tempo_pause_s SMALLINT/i);
    });
    it('ADD COLUMN tempo_concentric_s SMALLINT', () => {
      expect(MIGRATION).toMatch(/ADD COLUMN tempo_concentric_s SMALLINT/i);
    });
    it('каждая обёрнута в DO + information_schema check', () => {
      expect(MIGRATION).toMatch(/column_name = 'tempo_eccentric_s'/);
      expect(MIGRATION).toMatch(/column_name = 'tempo_pause_s'/);
      expect(MIGRATION).toMatch(/column_name = 'tempo_concentric_s'/);
    });
  });

  describe('Шаг 4 — chk_ce_has_prescription', () => {
    it('CHECK reps IS NOT NULL OR duration_seconds IS NOT NULL', () => {
      expect(MIGRATION).toMatch(/CONSTRAINT chk_ce_has_prescription\s+CHECK\s*\(reps IS NOT NULL OR duration_seconds IS NOT NULL\)/);
    });

    it('обёрнут в DO + pg_constraint exists-check (идемпотентно)', () => {
      expect(MIGRATION).toMatch(/pg_constraint[\s\S]*conname = 'chk_ce_has_prescription'/);
    });
  });

  describe('Шаг 5 — chk_ce_tempo (all-or-nothing + границы)', () => {
    it('CHECK содержит обе ветки: всё NULL ИЛИ всё задано', () => {
      expect(MIGRATION).toMatch(/tempo_eccentric_s IS NULL[\s\S]*AND tempo_pause_s IS NULL[\s\S]*AND tempo_concentric_s IS NULL/);
      expect(MIGRATION).toMatch(/tempo_eccentric_s IS NOT NULL[\s\S]*AND tempo_pause_s IS NOT NULL[\s\S]*AND tempo_concentric_s IS NOT NULL/);
    });

    it('границы: ecc/con >= 1, pause >= 0, всё <= 30', () => {
      expect(MIGRATION).toMatch(/tempo_eccentric_s >= 1/);
      expect(MIGRATION).toMatch(/tempo_concentric_s >= 1/);
      expect(MIGRATION).toMatch(/tempo_pause_s >= 0/);
      expect(MIGRATION).toMatch(/tempo_eccentric_s <= 30/);
      expect(MIGRATION).toMatch(/tempo_pause_s <= 30/);
      expect(MIGRATION).toMatch(/tempo_concentric_s <= 30/);
    });

    it('обёрнут в DO + pg_constraint exists-check (идемпотентно)', () => {
      expect(MIGRATION).toMatch(/pg_constraint[\s\S]*conname = 'chk_ce_tempo'/);
    });
  });

  describe('порядок шагов критичен', () => {
    it('chk_ce_has_prescription ДОБАВЛЯЕТСЯ ПОСЛЕ backfill (иначе упадёт на NULL/NULL)', () => {
      const backfillPos = MIGRATION.search(/UPDATE complex_exercises\s+SET reps = 10/);
      const constraintPos = MIGRATION.search(/ADD CONSTRAINT chk_ce_has_prescription/);
      expect(backfillPos).toBeGreaterThan(0);
      expect(constraintPos).toBeGreaterThan(backfillPos);
    });
  });
});
