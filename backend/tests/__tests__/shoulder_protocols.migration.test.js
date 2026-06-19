// =====================================================
// TEST: миграции 20260619_shoulder_protocols_*.sql (плечо, Волны 1–3)
//   Волна 1 — швы манжеты (_01..06): program_types + 4 RCR + templates
//   Волна 2 — прочая хирургия (_07..10): program_types + decompression + balloon + templates
//   Волна 3 — консервативные (_11..15): program_types + 3 протокола + templates
//
// Sanity-тест миграционного SQL как текста: проверяет наличие ключевых элементов
// (program_types, фазы, критерии, шаблоны, идемпотентность, классификация критериев).
// Реальное поведение проверяется через idempotency cycle:
//   createdb → schema.sql → все миграции ×2 → SELECT → dropdb (пройден на shoulder_test).
// =====================================================

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../../database/migrations');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
// Контент без строк-комментариев (-- ...) — чтобы проверки данных не ловили слова
// из пояснительных шапок (там намеренно упомянуты «PROM/AROM», «criterion_type 'measurement'»).
const stripComments = (sql) =>
  sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

// Волна 1
const PT_W1 = read('20260619_shoulder_protocols_01_program_types.sql');
const SUPRA = read('20260619_shoulder_protocols_02_rcr_supraspinatus.sql');
const INFRA = read('20260619_shoulder_protocols_03_rcr_infraspinatus.sql');
const SUBSCAP = read('20260619_shoulder_protocols_04_rcr_subscapularis.sql');
const MASSIVE = read('20260619_shoulder_protocols_05_rcr_massive.sql');
const TPL_W1 = read('20260619_shoulder_protocols_06_templates_seed.sql');
// Волна 2
const PT_W2 = read('20260619_shoulder_protocols_07_program_types_w2.sql');
const DECOMP = read('20260619_shoulder_protocols_08_subacromial_decompression.sql');
const BALLOON = read('20260619_shoulder_protocols_09_balloon.sql');
const TPL_W2 = read('20260619_shoulder_protocols_10_templates_w2.sql');
// Волна 3
const PT_W3 = read('20260619_shoulder_protocols_11_program_types_w3.sql');
const SUBACR_PAIN = read('20260619_shoulder_protocols_12_subacromial_pain_conservative.sql');
const CALCIFIC = read('20260619_shoulder_protocols_13_calcific.sql');
const RC_CONS = read('20260619_shoulder_protocols_14_rc_conservative.sql');
const TPL_W3 = read('20260619_shoulder_protocols_15_templates_w3.sql');

// Все 9 фаза-миграций (контент «Путь» + критерии)
const PHASE_FILES = {
  SUPRA, INFRA, SUBSCAP, MASSIVE,           // Волна 1
  DECOMP, BALLOON,                          // Волна 2
  SUBACR_PAIN, CALCIFIC, RC_CONS,           // Волна 3
};

// Карта program_type → ожидаемое число фаз (для шаблонов default_phase_count)
const PROTOCOLS = [
  ['shoulder_rcr_supraspinatus', 5], ['shoulder_rcr_infraspinatus', 5],
  ['shoulder_rcr_subscapularis', 5], ['shoulder_rcr_massive', 7],
  ['shoulder_subacromial_decompression', 4], ['shoulder_balloon', 5],
  ['shoulder_subacromial_pain_conservative', 4], ['shoulder_calcific', 5],
  ['shoulder_rc_conservative', 4],
];

describe('shoulder program_types — все 3 волны', () => {
  it('W1 заводит 4 кода RCR (joint shoulder, surgery TRUE)', () => {
    ['shoulder_rcr_supraspinatus', 'shoulder_rcr_infraspinatus', 'shoulder_rcr_subscapularis', 'shoulder_rcr_massive']
      .forEach((c) => expect(PT_W1).toMatch(new RegExp(`'${c}',\\s*'[^']+',\\s*'shoulder',\\s*TRUE`)));
  });
  it('W2 заводит decompression + balloon (surgery TRUE)', () => {
    ['shoulder_subacromial_decompression', 'shoulder_balloon']
      .forEach((c) => expect(PT_W2).toMatch(new RegExp(`'${c}',\\s*'[^']+',\\s*'shoulder',\\s*TRUE`)));
  });
  it('W3 заводит 3 консервативных (surgery FALSE)', () => {
    ['shoulder_subacromial_pain_conservative', 'shoulder_calcific', 'shoulder_rc_conservative']
      .forEach((c) => expect(PT_W3).toMatch(new RegExp(`'${c}',\\s*'[^']+',\\s*'shoulder',\\s*FALSE`)));
  });
  it('идемпотентны и в транзакции', () => {
    [PT_W1, PT_W2, PT_W3].forEach((sql) => {
      expect(sql).toMatch(/ON CONFLICT \(code\) DO NOTHING/i);
      expect(sql).toMatch(/^BEGIN;/m);
      expect(sql).toMatch(/^COMMIT;/m);
    });
  });
  it('не трогают shoulder_general и knee/acl типы', () => {
    [PT_W1, PT_W2, PT_W3].forEach((sql) => {
      expect(stripComments(sql)).not.toMatch(/shoulder_general|knee_|'acl'/);
    });
  });
});

describe.each(Object.entries(PHASE_FILES))('shoulder phase-миграция %s', (name, SQL) => {
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

describe('shoulder протоколы — фазовая структура', () => {
  it('хирургические RCR/decompression/balloon стартуют с phase 0, консервативные — с phase 1', () => {
    expect(SUPRA).toMatch(/'shoulder_rcr_supraspinatus', 0,/);
    expect(DECOMP).toMatch(/'shoulder_subacromial_decompression', 0,/);
    expect(BALLOON).toMatch(/'shoulder_balloon', 0,/);
    expect(SUBSCAP).not.toMatch(/'shoulder_rcr_subscapularis', 0,/);
    expect(SUBACR_PAIN).not.toMatch(/'shoulder_subacromial_pain_conservative', 0,/);
    expect(RC_CONS).not.toMatch(/'shoulder_rc_conservative', 0,/);
  });
  it('calcific имеет phase 0 (постпроцедурный условный)', () => {
    expect(CALCIFIC).toMatch(/'shoulder_calcific', 0,/);
  });
  it('massive — самый длинный: есть фаза 6', () => {
    expect(MASSIVE).toMatch(/'shoulder_rcr_massive', 6,/);
  });
  it('хирургические prehab (phase 0) используют палитру sprout/#10B981', () => {
    [SUPRA, INFRA, MASSIVE, DECOMP, BALLOON].forEach((SQL) => {
      expect(SQL).toMatch(/'sprout', '#10B981', '#EDFAF5'/);
    });
  });
  it('консервативные фазы 1 используют мягкую палитру dumbbell/#10B981 (НЕ хирургический shield)', () => {
    [SUBACR_PAIN, RC_CONS].forEach((SQL) => {
      expect(SQL).toMatch(/'dumbbell', '#10B981', '#EDFAF5'/);
      // у консервативных НЕТ красного shield (это тон пост-операционной защиты)
      expect(stripComments(SQL)).not.toMatch(/'shield', '#EF4444'/);
    });
  });
});

describe('shoulder protocols — templates seed (все 3 волны)', () => {
  it('заводит 9 карточек tpl_shoulder_* с правильными program_type и числом фаз', () => {
    const ALL_TPL = TPL_W1 + '\n' + TPL_W2 + '\n' + TPL_W3;
    PROTOCOLS.forEach(([pt, phases]) => {
      const re = new RegExp(`'tpl_${pt}',\\s*'${pt}',[\\s\\S]*?(TRUE|FALSE),\\s*${phases},`);
      expect(ALL_TPL).toMatch(re);
    });
  });
  it('все templates-сиды идемпотентны (ON CONFLICT DO NOTHING)', () => {
    [TPL_W1, TPL_W2, TPL_W3].forEach((sql) => expect(sql).toMatch(/ON CONFLICT \(code\) DO NOTHING/i));
  });
  it('templates-файлы сортируются ПОСЛЕ своих program_types (FK-порядок)', () => {
    const files = fs.readdirSync(DIR).filter((f) => /20260619_shoulder_protocols_/.test(f)).sort();
    const idx = (substr) => files.findIndex((f) => f.includes(substr));
    expect(idx('_06_templates')).toBeGreaterThan(idx('_01_program_types'));
    expect(idx('_10_templates')).toBeGreaterThan(idx('_07_program_types'));
    expect(idx('_15_templates')).toBeGreaterThan(idx('_11_program_types'));
  });
});
