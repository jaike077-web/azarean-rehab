// =====================================================
// TEST: миграции 20260625_shoulder_arthroplasty_*.sql (плечо, новая партия — артропластика)
//   _01 program_types (tsa + rsa) + _02 tsa (5 фаз) + _03 rsa (5 фаз) + _04 templates
//
// Sanity-тест миграционного SQL как текста: наличие ключевых элементов
// (program_types, фазы, критерии, шаблоны, идемпотентность, классификация критериев).
// Реальное поведение — через idempotency cycle (createdb → schema → миграции ×2 → SELECT → drop).
// =====================================================

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../../database/migrations');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
// Контент без строк-комментариев (-- ...) — чтобы проверки данных не ловили слова
// из пояснительных шапок (там намеренно упомянуты «PROM/ER/IR/MMT»).
const stripComments = (sql) =>
  sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

const PT = read('20260625_shoulder_arthroplasty_01_program_types.sql');
const TSA = read('20260625_shoulder_arthroplasty_02_tsa.sql');
const RSA = read('20260625_shoulder_arthroplasty_03_rsa.sql');
const TPL = read('20260625_shoulder_arthroplasty_04_templates.sql');

const PHASE_FILES = { TSA, RSA };
const PROTOCOLS = [['shoulder_tsa', 5], ['shoulder_rsa', 5]];

describe('shoulder arthroplasty program_types', () => {
  it('заводит tsa + rsa (joint shoulder, surgery TRUE)', () => {
    ['shoulder_tsa', 'shoulder_rsa']
      .forEach((c) => expect(PT).toMatch(new RegExp(`'${c}',\\s*'[^']+',\\s*'shoulder',\\s*TRUE`)));
  });
  it('идемпотентна и в транзакции', () => {
    expect(PT).toMatch(/ON CONFLICT \(code\) DO NOTHING/i);
    expect(PT).toMatch(/^BEGIN;/m);
    expect(PT).toMatch(/^COMMIT;/m);
  });
  it('не трогает shoulder_general, knee/acl и другие плечевые типы', () => {
    expect(stripComments(PT)).not.toMatch(/shoulder_general|knee_|'acl'|shoulder_rcr|shoulder_balloon|shoulder_calcific|shoulder_subacromial|shoulder_rc_conservative/);
  });
});

describe.each(Object.entries(PHASE_FILES))('shoulder arthroplasty phase-миграция %s', (name, SQL) => {
  it('в транзакции BEGIN/COMMIT', () => {
    expect(SQL).toMatch(/^BEGIN;/m);
    expect(SQL).toMatch(/^COMMIT;/m);
  });
  it('вставляет фазы с ON CONFLICT (program_type, phase_number)', () => {
    expect(SQL).toMatch(/INSERT INTO rehab_phases/i);
    expect(SQL).toMatch(/ON CONFLICT \(program_type, phase_number\) DO NOTHING/i);
  });
  it('вставляет критерии с JOIN по program_type+phase_number и ON CONFLICT (phase_id, criterion_code)', () => {
    expect(SQL).toMatch(/INSERT INTO phase_transition_criteria/i);
    expect(SQL).toMatch(/JOIN rehab_phases p ON p\.program_type = '[^']+' AND p\.phase_number = cd\.phase_number/);
    expect(SQL).toMatch(/ON CONFLICT \(phase_id, criterion_code\) DO NOTHING/i);
  });
  it('measurement-критерии используют vas_score + pain (правило классификации)', () => {
    const measLines = stripComments(SQL).split('\n').filter((l) => /'measurement'/.test(l));
    measLines.forEach((l) => {
      expect(l).toMatch(/'vas_score'(::varchar)?,\s*'pain'(::varchar)?/);
    });
  });
  it('не содержит сырой клинический жаргон PROM/AROM в пациентских строках', () => {
    expect(stripComments(SQL)).not.toMatch(/\bPROM\b|\bAROM\b|\bAAROM\b/);
  });
});

describe('shoulder arthroplasty — фазовая структура', () => {
  it('tsa и rsa — хирургические, стартуют с phase 0', () => {
    expect(TSA).toMatch(/'shoulder_tsa', 0,/);
    expect(RSA).toMatch(/'shoulder_rsa', 0,/);
  });
  it('оба имеют 5 фаз (есть phase 4)', () => {
    expect(TSA).toMatch(/'shoulder_tsa', 4,/);
    expect(RSA).toMatch(/'shoulder_rsa', 4,/);
  });
  it('prehab (phase 0) использует палитру sprout/#10B981', () => {
    [TSA, RSA].forEach((SQL) => expect(SQL).toMatch(/'sprout', '#10B981', '#EDFAF5'/));
  });
  it('фаза 1 (максимальная защита) использует хирургический shield/#EF4444', () => {
    [TSA, RSA].forEach((SQL) => expect(SQL).toMatch(/'shield', '#EF4444', '#FEF2F0'/));
  });
  it('RSA терминальная фаза 4 несёт критерии, TSA — нет (решение D 2026-06-22)', () => {
    expect(RSA).toMatch(/\n\s*\(4, '/);          // RSA criteria_data содержит строки фазы 4
    expect(TSA).not.toMatch(/\n\s*\(4, '/);       // TSA criteria_data — без фазы 4
  });
});

describe('shoulder arthroplasty — templates seed', () => {
  it('заводит 2 карточки tpl_shoulder_* с правильными program_type и числом фаз', () => {
    PROTOCOLS.forEach(([pt, phases]) => {
      const re = new RegExp(`'tpl_${pt}',\\s*'${pt}',[\\s\\S]*?(TRUE|FALSE),\\s*${phases},`);
      expect(TPL).toMatch(re);
    });
  });
  it('templates-сид идемпотентен (ON CONFLICT DO NOTHING)', () => {
    expect(TPL).toMatch(/ON CONFLICT \(code\) DO NOTHING/i);
  });
  it('templates-файл сортируется ПОСЛЕ program_types (FK-порядок)', () => {
    const files = fs.readdirSync(DIR).filter((f) => /20260625_shoulder_arthroplasty_/.test(f)).sort();
    const idx = (substr) => files.findIndex((f) => f.includes(substr));
    expect(idx('_04_templates')).toBeGreaterThan(idx('_01_program_types'));
  });
});
