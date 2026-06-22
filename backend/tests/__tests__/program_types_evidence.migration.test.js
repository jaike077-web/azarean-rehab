// =====================================================
// TEST: доказательная база program_types (Part B)
//   20260622_program_types_evidence.sql       — ALTER (2 колонки)
//   20260622_program_types_evidence_seed.sql  — seed 15 колено-протоколов
//
// Sanity-тест SQL как текста. Реальное поведение — idempotency cycle
// (createdb → schema → миграции → мои×2 → SELECT: колонки=2, 15 knee с evidence).
// =====================================================

const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '../../database/migrations');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const ALTER = read('20260622_program_types_evidence.sql');
const SEED = read('20260622_program_types_evidence_seed.sql');

const KNEE15 = [
  'acl', 'knee_oa', 'knee_tka', 'knee_pcl', 'knee_cartilage_repair',
  'knee_extensor_mechanism_repair', 'knee_osteotomy_hto_dfo', 'knee_patellar_tendinopathy',
  'knee_pfps', 'knee_itbs', 'knee_meniscus_repair', 'knee_meniscus_root_repair',
  'knee_meniscectomy', 'knee_meniscus_conservative', 'knee_meniscus_allograft',
];

describe('ALTER program_types evidence — структура', () => {
  it('обёрнут в транзакцию', () => {
    expect(ALTER).toMatch(/^BEGIN;/m);
    expect(ALTER).toMatch(/^COMMIT;/m);
  });
  it('добавляет evidence_summary и evidence_sources идемпотентно (IF NOT EXISTS)', () => {
    expect(ALTER).toMatch(/ADD COLUMN IF NOT EXISTS evidence_summary TEXT/i);
    expect(ALTER).toMatch(/ADD COLUMN IF NOT EXISTS evidence_sources TEXT/i);
  });
});

describe('SEED доказательной базы — структура', () => {
  it('обёрнут в транзакцию', () => {
    expect(SEED).toMatch(/^BEGIN;/m);
    expect(SEED).toMatch(/^COMMIT;/m);
  });
  it('ровно 15 UPDATE-стейтментов', () => {
    const m = SEED.match(/UPDATE program_types SET evidence_summary =/g) || [];
    expect(m.length).toBe(15);
  });
  it('покрывает все 15 колено-протоколов', () => {
    for (const code of KNEE15) {
      expect(SEED).toMatch(new RegExp(`WHERE code = '${code}';`));
    }
  });
  it('каждый UPDATE заполняет оба поля (summary + sources)', () => {
    const m = SEED.match(/SET evidence_summary = '.+?', evidence_sources = '.+?' WHERE code = '[a-z_]+';/gs) || [];
    expect(m.length).toBe(15);
  });
  it('апострофы экранированы (нет «висящих» одинарных кавычек, ломающих SQL)', () => {
    // В тексте есть O'Connor/O'Donnell → должны быть как '' внутри литерала.
    expect(SEED).toMatch(/O''Donnell/);
    expect(SEED).toMatch(/O''Connor/);
  });
});
