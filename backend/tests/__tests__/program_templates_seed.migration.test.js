// =====================================================
// TEST: миграция 20260603_knee_program_templates_seed.sql
// Follow-up к knee-протоколам — 10 шаблонов-карточек wizard'а.
//
// Sanity-тест миграционного SQL как текста: наличие 10 кодов,
// корректные program_type, ON CONFLICT, деактивация acl_rehab,
// BEGIN/COMMIT. Реальное поведение + FK + порядок проверяется
// idempotency cycle (createdb → schema → миграции ×2).
// =====================================================

const fs = require('fs');
const path = require('path');

const MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../database/migrations/20260603_knee_program_templates_seed.sql'),
  'utf8'
);

// code → program_type, ожидаемые 10 шаблонов (1:1 к протоколам)
const EXPECTED = {
  tpl_acl: 'acl',
  tpl_knee_tka: 'knee_tka',
  tpl_knee_pcl: 'knee_pcl',
  tpl_knee_extensor_mechanism_repair: 'knee_extensor_mechanism_repair',
  tpl_knee_osteotomy_hto_dfo: 'knee_osteotomy_hto_dfo',
  tpl_knee_cartilage_repair: 'knee_cartilage_repair',
  tpl_knee_oa: 'knee_oa',
  tpl_knee_patellar_tendinopathy: 'knee_patellar_tendinopathy',
  tpl_knee_pfps: 'knee_pfps',
  tpl_knee_itbs: 'knee_itbs',
};

describe('20260603_knee_program_templates_seed — структура SQL', () => {
  it('обёрнута в транзакцию BEGIN/COMMIT', () => {
    expect(MIGRATION).toMatch(/^BEGIN;/m);
    expect(MIGRATION).toMatch(/^COMMIT;/m);
  });

  it('вставка в program_templates через ON CONFLICT (code) DO NOTHING (идемпотентно)', () => {
    expect(MIGRATION).toMatch(/INSERT INTO program_templates/i);
    expect(MIGRATION).toMatch(/ON CONFLICT \(code\) DO NOTHING/i);
  });

  it('содержит ровно 10 шаблонов (tpl_ кодов в VALUES)', () => {
    const matches = MIGRATION.match(/'tpl_[a-z0-9_]+'/g) || [];
    const unique = new Set(matches.map((m) => m.replace(/'/g, '')));
    expect(unique.size).toBe(10);
  });

  Object.entries(EXPECTED).forEach(([code, programType]) => {
    it(`шаблон ${code} ссылается на program_type ${programType}`, () => {
      const re = new RegExp(`'${code}'\\s*,\\s*'${programType}'`);
      expect(MIGRATION).toMatch(re);
    });
  });

  it('все коды шаблонов проходят admin-валидацию ^[a-z0-9_]{1,50}$', () => {
    Object.keys(EXPECTED).forEach((code) => {
      expect(code).toMatch(/^[a-z0-9_]{1,50}$/);
    });
  });

  it('деактивирует старый acl_rehab (идемпотентный UPDATE)', () => {
    expect(MIGRATION).toMatch(/UPDATE program_templates[\s\S]*SET is_active = FALSE[\s\S]*WHERE code = 'acl_rehab'/i);
  });

  it('вставка идёт ДО деактивации (порядок не критичен, но фиксируем намерение)', () => {
    // Убираем строки-комментарии (-- ...), чтобы не ловить упоминания
    // INSERT/UPDATE в шапке — сверяем порядок реальных стейтментов.
    const sql = MIGRATION.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const insertPos = sql.search(/INSERT INTO program_templates/i);
    const updatePos = sql.search(/UPDATE program_templates/i);
    expect(insertPos).toBeGreaterThan(0);
    expect(updatePos).toBeGreaterThan(insertPos);
  });
});
