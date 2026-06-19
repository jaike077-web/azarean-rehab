// Тесты ядра надиктовки упражнений (чистые функции, без БД/сети).
const {
  CHECKLIST,
  buildStructuringPrompt,
  parseModelJson,
  normalizeStructuredExercise,
} = require('../../utils/exerciseStructuring');

describe('exerciseStructuring — CHECKLIST', () => {
  test('каждый пункт имеет key/label/hint', () => {
    expect(CHECKLIST.length).toBeGreaterThan(5);
    for (const item of CHECKLIST) {
      expect(typeof item.key).toBe('string');
      expect(typeof item.label).toBe('string');
      expect(typeof item.hint).toBe('string');
    }
  });

  test('ключи чек-листа покрывают основные поля', () => {
    const keys = CHECKLIST.map((c) => c.key);
    ['title', 'body_region', 'exercise_type', 'difficulty_level', 'equipment', 'instructions', 'contraindications']
      .forEach((k) => expect(keys).toContain(k));
  });
});

describe('exerciseStructuring — buildStructuringPrompt', () => {
  test('включает расшифровку и разрешённые коды', () => {
    const { system, user } = buildStructuringPrompt('Маятник, плечо, без оборудования');
    expect(user).toContain('Маятник, плечо, без оборудования');
    expect(system).toContain('resistance-band');
    expect(system).toContain('shoulder');
    expect(system).toMatch(/НИЧЕГО НЕ ВЫДУМЫВАЙ/i);
    expect(system).toMatch(/только валидный json/i);
  });

  test('устойчив к пустому вводу', () => {
    const { user } = buildStructuringPrompt(null);
    expect(typeof user).toBe('string');
  });

  test('содержит глоссарий упрощения терминов (для пациент-текста)', () => {
    const { system } = buildStructuringPrompt('тест');
    expect(system).toMatch(/квадрицепс/);
    expect(system).toMatch(/передняя поверхность бедра/);
    // глоссарий применяется только к description, не к instructions/cues
    expect(system).toMatch(/ТОЛЬКО в description/i);
  });

  test('содержит few-shot примеры диктовка→JSON', () => {
    const { system } = buildStructuringPrompt('тест');
    expect(system).toMatch(/Примеры/);
    expect(system).toContain('Маятник для плеча');
    expect(system).toContain('"body_region":"shoulder"');
  });

  test('инструктирует нормализовать числа словами и guard на мусор', () => {
    const { system } = buildStructuringPrompt('тест');
    expect(system).toMatch(/словами.*цифры|цифры/i);
    expect(system).toMatch(/needs_clarification/);
  });
});

describe('exerciseStructuring — parseModelJson', () => {
  test('чистый JSON', () => {
    expect(parseModelJson('{"title":"X"}')).toEqual({ title: 'X' });
  });

  test('JSON в ```json fence', () => {
    const txt = 'Вот результат:\n```json\n{"title":"Маятник"}\n```\nготово';
    expect(parseModelJson(txt)).toEqual({ title: 'Маятник' });
  });

  test('JSON с текстом вокруг', () => {
    expect(parseModelJson('бла бла {"a":1} конец')).toEqual({ a: 1 });
  });

  test('уже распарсенный объект — passthrough', () => {
    const obj = { title: 'X' };
    expect(parseModelJson(obj)).toBe(obj);
  });

  test('мусор → null', () => {
    expect(parseModelJson('не json вообще')).toBeNull();
    expect(parseModelJson(42)).toBeNull();
  });
});

describe('normalizeStructuredExercise — коды', () => {
  test('валидные коды проходят как есть', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Маятник',
      exercise_type: 'mobilization',
      body_region: 'shoulder',
      equipment: ['no-equipment'],
      position: ['standing'],
      rehab_phases: ['acute'],
    });
    expect(fields.exercise_type).toBe('mobilization');
    expect(fields.body_region).toBe('shoulder');
    expect(fields.equipment).toEqual(['no-equipment']);
    expect(fields.position).toEqual(['standing']);
    expect(fields.rehab_phases).toEqual(['acute']);
  });

  test('русские синонимы маппятся на коды', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Тест',
      exercise_type: 'мобилизация',
      body_region: 'плечо',
      equipment: ['резинка', 'фитбол'],
      position: ['лёжа на спине'],
      rehab_phases: ['острая'],
    });
    expect(fields.exercise_type).toBe('mobilization');
    expect(fields.body_region).toBe('shoulder');
    expect(fields.equipment).toEqual(['resistance-band', 'swiss-ball']);
    expect(fields.position).toEqual(['supine']);
    expect(fields.rehab_phases).toEqual(['acute']);
  });

  test('неизвестное оборудование → warning, отброшено', () => {
    const { fields, warnings } = normalizeStructuredExercise({
      title: 'Тест',
      equipment: ['резинка', 'волшебная палочка'],
    });
    expect(fields.equipment).toEqual(['resistance-band']);
    expect(warnings.join(' ')).toMatch(/волшебная палочка/);
  });

  test('дубликаты в массиве схлопываются', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Тест',
      equipment: ['резинка', 'resistance-band', 'лента'],
    });
    expect(fields.equipment).toEqual(['resistance-band']);
  });

  test('equipment не-массивом коэрсится', () => {
    const { fields } = normalizeStructuredExercise({ title: 'Т', equipment: 'гантель' });
    expect(fields.equipment).toEqual(['dumbbell']);
  });
});

describe('normalizeStructuredExercise — difficulty', () => {
  test('валидное число проходит', () => {
    expect(normalizeStructuredExercise({ title: 'Т', difficulty_level: 3 }).fields.difficulty_level).toBe(3);
  });
  test('выше 5 → 5, ниже 1 → 1', () => {
    expect(normalizeStructuredExercise({ title: 'Т', difficulty_level: 7 }).fields.difficulty_level).toBe(5);
    expect(normalizeStructuredExercise({ title: 'Т', difficulty_level: 0 }).fields.difficulty_level).toBe(1);
  });
  test('строка-число округляется', () => {
    expect(normalizeStructuredExercise({ title: 'Т', difficulty_level: '4.2' }).fields.difficulty_level).toBe(4);
  });
  test('не число → warning, поле отсутствует', () => {
    const { fields, warnings } = normalizeStructuredExercise({ title: 'Т', difficulty_level: 'сложно' });
    expect(fields.difficulty_level).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/difficulty_level/);
  });
  test('не задано — поле отсутствует (форма оставит свой дефолт)', () => {
    expect(normalizeStructuredExercise({ title: 'Т' }).fields.difficulty_level).toBeUndefined();
  });
});

describe('normalizeStructuredExercise — текст и безопасность', () => {
  test('текстовые поля переносятся как есть (без выдумок)', () => {
    const { fields } = normalizeStructuredExercise({
      title: '  Маятник  ',
      instructions: 'Наклонитесь, расслабьте руку, качайте по кругу.',
      contraindications: 'Острая боль в плече.',
    });
    expect(fields.title).toBe('Маятник');
    expect(fields.instructions).toMatch(/качайте по кругу/);
    expect(fields.contraindications).toBe('Острая боль в плече.');
  });

  test('текстовое поле массивом склеивается по-человечески', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Т',
      contraindications: ['острая боль', 'свежий вывих'],
    });
    expect(fields.contraindications).toBe('острая боль, свежий вывих');
  });

  test('пустой title → warning', () => {
    const { fields, warnings } = normalizeStructuredExercise({ instructions: 'что-то' });
    expect(fields.title).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/название не распознано/i);
  });

  test('пустые строки не попадают в fields', () => {
    const { fields } = normalizeStructuredExercise({ title: 'Т', tips: '   ', cues: '' });
    expect(fields.tips).toBeUndefined();
    expect(fields.cues).toBeUndefined();
  });

  test('лишние поля игнорируются', () => {
    const { fields } = normalizeStructuredExercise({ title: 'Т', hacker: 'DROP TABLE', id: 999 });
    expect(fields.hacker).toBeUndefined();
    expect(fields.id).toBeUndefined();
  });

  test('невалидный JSON-вход → пустые fields + warning', () => {
    const { fields, warnings } = normalizeStructuredExercise('не json');
    expect(fields).toEqual({});
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('строка с JSON разбирается', () => {
    const { fields } = normalizeStructuredExercise('{"title":"Из строки","body_region":"колено"}');
    expect(fields.title).toBe('Из строки');
    expect(fields.body_region).toBe('knee');
  });

  test('needs_clarification (только этот ключ) → пустые fields + warning, без выдумок', () => {
    const { fields, warnings } = normalizeStructuredExercise({
      needs_clarification: 'не названо упражнение',
    });
    expect(fields).toEqual({});
    expect(warnings.join(' ')).toMatch(/не описание упражнения/i);
    expect(warnings.join(' ')).toMatch(/не названо упражнение/);
  });

  test('needs_clarification рядом с реальными полями — НЕ блокирует разбор', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Маятник',
      body_region: 'плечо',
      needs_clarification: 'темп не указан',
    });
    expect(fields.title).toBe('Маятник');
    expect(fields.body_region).toBe('shoulder');
  });
});
