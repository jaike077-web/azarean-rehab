// =====================================================
// TEST: миграции 20260625_shoulder_batch2_*.sql (новая плечевая партия — 13 протоколов)
//   _01 program_types (13) + _02.._14 протоколы (нестабильность / бицепс / переломы /
//   АКС / капсула-артроз / SLAP) + _15 templates (13)
//
// Sanity-тест миграционного SQL как текста. Реальное поведение — через idempotency cycle
// (createdb → schema → все миграции ×2 → SELECT → drop, пройден на arthro_test).
// =====================================================

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../../database/migrations');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const stripComments = (sql) =>
  sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

const PT = read('20260625_shoulder_batch2_01_program_types.sql');
const TPL = read('20260625_shoulder_batch2_15_templates.sql');

// [code, file, phase_count, surgical]
const PROTOCOLS = [
  ['shoulder_latarjet',                 '20260625_shoulder_batch2_02_latarjet.sql',                 6, true],
  ['shoulder_bankart',                  '20260625_shoulder_batch2_03_bankart.sql',                  7, true],
  ['shoulder_instability_conservative', '20260625_shoulder_batch2_04_instability_conservative.sql', 4, false],
  ['shoulder_biceps_tenodesis',         '20260625_shoulder_batch2_05_biceps_tenodesis.sql',         6, true],
  ['shoulder_biceps_tenotomy',          '20260625_shoulder_batch2_06_biceps_tenotomy.sql',          5, true],
  ['shoulder_phf_orif',                 '20260625_shoulder_batch2_07_phf_orif.sql',                 6, true],
  ['shoulder_phf_conservative',         '20260625_shoulder_batch2_08_phf_conservative.sql',         4, false],
  ['shoulder_clavicle_orif',            '20260625_shoulder_batch2_09_clavicle_orif.sql',            6, true],
  ['shoulder_ac_repair',                '20260625_shoulder_batch2_10_ac_repair.sql',                6, true],
  ['shoulder_ac_conservative',          '20260625_shoulder_batch2_11_ac_conservative.sql',          3, false],
  ['shoulder_frozen',                   '20260625_shoulder_batch2_12_frozen.sql',                   3, false],
  ['shoulder_oa',                       '20260625_shoulder_batch2_13_oa.sql',                       3, false],
  ['shoulder_slap',                     '20260625_shoulder_batch2_14_slap.sql',                     7, true],
];

const SURGICAL = PROTOCOLS.filter((p) => p[3]);
const CONSERVATIVE = PROTOCOLS.filter((p) => !p[3]);

describe('shoulder batch2 program_types', () => {
  it('заводит все 13 кодов (joint shoulder)', () => {
    PROTOCOLS.forEach(([c]) =>
      expect(PT).toMatch(new RegExp(`'${c}',\\s*'[^']+',\\s*'shoulder',`)));
  });
  it('surgery_required корректен для хирургических (TRUE) и консервативных (FALSE)', () => {
    SURGICAL.forEach(([c]) => expect(PT).toMatch(new RegExp(`'${c}',\\s*'[^']+',\\s*'shoulder',\\s*TRUE`)));
    CONSERVATIVE.forEach(([c]) => expect(PT).toMatch(new RegExp(`'${c}',\\s*'[^']+',\\s*'shoulder',\\s*FALSE`)));
  });
  it('идемпотентна и в транзакции', () => {
    expect(PT).toMatch(/ON CONFLICT \(code\) DO NOTHING/i);
    expect(PT).toMatch(/^BEGIN;/m);
    expect(PT).toMatch(/^COMMIT;/m);
  });
  it('не трогает shoulder_general, knee/acl, манжету, артропластику', () => {
    expect(stripComments(PT)).not.toMatch(/shoulder_general|knee_|'acl'|shoulder_rcr|shoulder_tsa|shoulder_rsa|shoulder_balloon/);
  });
});

describe.each(PROTOCOLS)('shoulder batch2 phase-миграция %s', (code, file, phaseCount, surgical) => {
  const SQL = read(file);
  it('в транзакции BEGIN/COMMIT', () => {
    expect(SQL).toMatch(/^BEGIN;/m);
    expect(SQL).toMatch(/^COMMIT;/m);
  });
  it('фазы с ON CONFLICT (program_type, phase_number)', () => {
    expect(SQL).toMatch(/INSERT INTO rehab_phases/i);
    expect(SQL).toMatch(/ON CONFLICT \(program_type, phase_number\) DO NOTHING/i);
  });
  it('критерии с JOIN по program_type+phase_number и ON CONFLICT (phase_id, criterion_code)', () => {
    expect(SQL).toMatch(/INSERT INTO phase_transition_criteria/i);
    expect(SQL).toMatch(new RegExp(`JOIN rehab_phases p ON p\\.program_type = '${code}' AND p\\.phase_number = cd\\.phase_number`));
    expect(SQL).toMatch(/ON CONFLICT \(phase_id, criterion_code\) DO NOTHING/i);
  });
  it('measurement-критерии используют ТОЛЬКО vas_score + pain', () => {
    stripComments(SQL).split('\n').filter((l) => /'measurement'/.test(l)).forEach((l) => {
      expect(l).toMatch(/'vas_score'(::varchar)?,\s*'pain'(::varchar)?/);
    });
  });
  it('instructor_check-критерии НЕ несут порога/оператора (число — в тексте label)', () => {
    // Гэп, найденный адверсариальным ревью: instructor_check с threshold_operator='='.
    // У instructor_check ВСЕ measurement/threshold-поля должны быть NULL → в строке
    // не должно быть ни одного quoted-оператора сравнения.
    stripComments(SQL).split('\n').filter((l) => /'instructor_check'/.test(l)).forEach((l) => {
      expect(l).not.toMatch(/'(>=|<=|=|>|<|between)'/);
    });
  });
  it('фаза-номера соответствуют ожидаемому числу фаз', () => {
    const nums = [...SQL.matchAll(new RegExp(`'${code}', (\\d+),`, 'g'))].map((m) => Number(m[1]));
    const uniq = [...new Set(nums)].sort((a, b) => a - b);
    expect(uniq.length).toBe(phaseCount);
  });
  it('нет сырого жаргона PROM/AROM/ER/IR/MMT в пациентских строках', () => {
    expect(stripComments(SQL)).not.toMatch(/\bPROM\b|\bAROM\b|\bAAROM\b|\bMMT\b|scaption/);
  });
});

describe('shoulder batch2 — палитра по типу', () => {
  it('хирургические: phase 0 = sprout, phase 1 = shield (красный)', () => {
    SURGICAL.forEach(([code, file]) => {
      const SQL = read(file);
      if (/'\s*shoulder_[a-z_]+', 0,/.test(SQL) || new RegExp(`'${code}', 0,`).test(SQL)) {
        expect(SQL).toMatch(/'sprout', '#10B981', '#EDFAF5'/);
      }
      expect(SQL).toMatch(/'shield', '#EF4444', '#FEF2F0'/);
    });
  });
  it('консервативные: phase 1 = dumbbell зелёный, БЕЗ красного shield', () => {
    CONSERVATIVE.forEach(([code, file]) => {
      const SQL = read(file);
      expect(SQL).toMatch(/'dumbbell', '#10B981', '#EDFAF5'/);
      expect(stripComments(SQL)).not.toMatch(/'shield', '#EF4444'/);
    });
  });
});

describe('shoulder batch2 — templates seed', () => {
  it('заводит 13 карточек tpl_shoulder_* с правильными program_type и числом фаз', () => {
    PROTOCOLS.forEach(([code, , phaseCount]) => {
      const re = new RegExp(`'tpl_${code}',\\s*'${code}',[\\s\\S]*?(TRUE|FALSE),\\s*${phaseCount},`);
      expect(TPL).toMatch(re);
    });
  });
  it('templates-сид идемпотентен', () => {
    expect(TPL).toMatch(/ON CONFLICT \(code\) DO NOTHING/i);
  });
  it('templates-файл (_15) сортируется ПОСЛЕ program_types (_01) — FK-порядок', () => {
    const files = fs.readdirSync(DIR).filter((f) => /20260625_shoulder_batch2_/.test(f)).sort();
    const idx = (s) => files.findIndex((f) => f.includes(s));
    expect(idx('_15_templates')).toBeGreaterThan(idx('_01_program_types'));
  });
});
