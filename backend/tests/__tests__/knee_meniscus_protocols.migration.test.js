// =====================================================
// TEST: K1 — менисковые протоколы колена (20260622_knee_meniscus_01..07)
//
// Sanity-тест миграционного SQL как текста: структура, идемпотентность,
// классификация критериев (knee-конвенция), полнота фаз/шаблонов.
// Реальное поведение проверено idempotency-циклом:
//   createdb → schema.sql → все миграции → мои×2 → SELECT → drop (зелёный).
// =====================================================

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../../database/migrations');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const TYPES = read('20260622_knee_meniscus_01_program_types.sql');
const TPL = read('20260622_knee_meniscus_07_program_templates_seed.sql');

const PROTO = [
  { file: '20260622_knee_meniscus_02_meniscus_repair.sql',      code: 'knee_meniscus_repair',       surgery: true,  phases: 6 },
  { file: '20260622_knee_meniscus_03_meniscus_root_repair.sql', code: 'knee_meniscus_root_repair',  surgery: true,  phases: 6 },
  { file: '20260622_knee_meniscus_04_meniscectomy.sql',         code: 'knee_meniscectomy',          surgery: true,  phases: 3 },
  { file: '20260622_knee_meniscus_05_meniscus_conservative.sql',code: 'knee_meniscus_conservative', surgery: false, phases: 3 },
  { file: '20260622_knee_meniscus_06_meniscus_allograft.sql',   code: 'knee_meniscus_allograft',    surgery: true,  phases: 6 },
];

const ALLOWED_MT = ['knee_flexion_degrees', 'knee_extension_degrees', 'vas_score'];

describe('K1 01_program_types — справочник типов', () => {
  it('обёрнут в транзакцию', () => {
    expect(TYPES).toMatch(/^BEGIN;/m);
    expect(TYPES).toMatch(/^COMMIT;/m);
  });
  it('содержит все 5 менисковых кодов с joint=knee', () => {
    for (const p of PROTO) {
      const re = new RegExp(`'${p.code}'\\s*,\\s*'[^']+'\\s*,\\s*'knee'\\s*,\\s*${p.surgery ? 'TRUE' : 'FALSE'}`);
      expect(TYPES).toMatch(re);
    }
  });
  it('консервативный разрыв = surgery_required FALSE, остальные TRUE', () => {
    expect(TYPES).toMatch(/'knee_meniscus_conservative'\s*,\s*'[^']+'\s*,\s*'knee'\s*,\s*FALSE/);
    expect(TYPES).toMatch(/'knee_meniscus_repair'\s*,\s*'[^']+'\s*,\s*'knee'\s*,\s*TRUE/);
  });
  it('идемпотентен через ON CONFLICT (code) DO NOTHING', () => {
    expect(TYPES).toMatch(/ON CONFLICT \(code\) DO NOTHING/i);
  });
});

describe.each(PROTO)('K1 протокол $code', ({ file, code, phases }) => {
  const SQL = read(file);

  it('обёрнут в транзакцию', () => {
    expect(SQL).toMatch(/^BEGIN;/m);
    expect(SQL).toMatch(/^COMMIT;/m);
  });

  it('вставляет фазы в rehab_phases идемпотентно', () => {
    expect(SQL).toMatch(/INSERT INTO rehab_phases/i);
    expect(SQL).toMatch(/ON CONFLICT \(program_type, phase_number\) DO NOTHING/i);
  });

  it(`содержит ровно ${phases} фаз`, () => {
    const re = new RegExp(`\\(\\s*'${code}',\\s*\\d+,`, 'g');
    const m = SQL.match(re) || [];
    expect(m.length).toBe(phases);
  });

  it('критерии через CTE + JOIN на rehab_phases, идемпотентно', () => {
    expect(SQL).toMatch(/WITH criteria_data/i);
    expect(SQL).toMatch(/INSERT INTO phase_transition_criteria/i);
    expect(SQL).toMatch(new RegExp(`JOIN rehab_phases p ON p\\.program_type = '${code}'`));
    expect(SQL).toMatch(/ON CONFLICT \(phase_id, criterion_code\) DO NOTHING/i);
  });

  it('measurement_type только из разрешённого набора (knee-конвенция)', () => {
    // Все непустые measurement_type-литералы (форма 'X'::varchar в строках критериев)
    // должны входить в ALLOWED_MT. Ловим обращения к запрещённым кодам как measurement_type.
    const forbidden = /'(quad_strength|hamstring_strength|glute_strength|hop_|koos_|ikdc_|lsi|effusion|single_leg|gait_)[a-z_]*'::varchar/i;
    expect(SQL).not.toMatch(forbidden);
    // Хотя бы один разрешённый measurement_type присутствует (есть measurement-критерии)
    expect(ALLOWED_MT.some((mt) => SQL.includes(`'${mt}'`))).toBe(true);
  });

  it('measurement-критерии боли используют vas_score (не vas_pain)', () => {
    expect(SQL).not.toMatch(/'vas_pain'/);
  });
});

describe('K1 07_program_templates — карточки wizard', () => {
  it('обёрнут в транзакцию + идемпотентен', () => {
    expect(TPL).toMatch(/^BEGIN;/m);
    expect(TPL).toMatch(/^COMMIT;/m);
    expect(TPL).toMatch(/ON CONFLICT \(code\) DO NOTHING/i);
  });
  it('содержит карточку-шаблон на каждый из 5 типов', () => {
    for (const p of PROTO) {
      expect(TPL).toMatch(new RegExp(`'tpl_${p.code}'\\s*,\\s*'${p.code}'`));
    }
  });
});

describe('K1 агрегат', () => {
  it('суммарно 24 фазы по 5 протоколам', () => {
    const total = PROTO.reduce((acc, p) => {
      const SQL = read(p.file);
      const re = new RegExp(`\\(\\s*'${p.code}',\\s*\\d+,`, 'g');
      return acc + (SQL.match(re) || []).length;
    }, 0);
    expect(total).toBe(24);
  });
});
