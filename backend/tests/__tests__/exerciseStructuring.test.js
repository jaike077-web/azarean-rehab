// Тесты ядра надиктовки упражнений (чистые функции, без БД/сети).
const {
  CHECKLIST,
  buildStructuringPrompt,
  buildScriptPlannerPrompt,
  buildReviewPrompt,
  buildFixPrompt,
  summarizeReview,
  buildSanityPrompt,
  summarizeSanity,
  buildCompletenessPrompt,
  buildConsistencyPrompt,
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
    ['title', 'body_region', 'exercise_type', 'difficulty_level', 'equipment', 'instructions', 'contraindications', 'variations', 'progression']
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
    expect(system).toContain('"body_region":["shoulder"]');
  });

  test('body_region — массив; есть многосуставный пример (присед = колено+ТБС)', () => {
    const { system } = buildStructuringPrompt('тест');
    expect(system).toMatch(/body_region \(МАССИВ\)/);
    expect(system).toMatch(/перечисляй ВСЕ задействованные суставы/i);
    expect(system).toContain('"body_region":["knee","hip"]');
  });

  test('инструктирует нормализовать числа словами и guard на мусор', () => {
    const { system } = buildStructuringPrompt('тест');
    expect(system).toMatch(/словами.*цифры|цифры/i);
    expect(system).toMatch(/needs_clarification/);
  });

  test('фиксирует форму обращения «вы» + правило удержания без выдумки длительности', () => {
    const { system } = buildStructuringPrompt('тест');
    expect(system).toMatch(/на «ВЫ»/);
    expect(system).toMatch(/УДЕРЖАНИЕ/i);
    expect(system).toMatch(/НЕ придумывай\s+число|не выдумывай/i);
  });
});

describe('exerciseStructuring — buildScriptPlannerPrompt (этап 4)', () => {
  test('включает черновое название и инструкцию JSON-вывода', () => {
    const { system, user } = buildScriptPlannerPrompt({ title: 'Маятник Кодмана', body_region: 'плечо' });
    expect(user).toContain('Маятник Кодмана');
    expect(user).toContain('плечо');
    expect(system).toMatch(/script/);
    expect(system).toMatch(/review_points/);
    expect(system).toMatch(/только валидный json/i);
  });

  test('требует выносить «уточните» ТОЛЬКО в review_points (script — чистый пациент-текст)', () => {
    const { system } = buildScriptPlannerPrompt({ title: 'X' });
    expect(system).toMatch(/ЧЕРНОВИК ПОД ВЫЧИТКУ/i);
    expect(system).toMatch(/review_points/);
    expect(system).toMatch(/НЕ пиши «уточните/i);
    expect(system).toMatch(/чистый пациентский текст/i);
  });

  test('устойчив к пустому вводу', () => {
    const { system, user } = buildScriptPlannerPrompt(null);
    expect(typeof system).toBe('string');
    expect(typeof user).toBe('string');
  });
});

describe('exerciseStructuring — buildReviewPrompt / buildFixPrompt', () => {
  test('reviewer видит исходную расшифровку и поля + критерий faithfulness', () => {
    const { system, user } = buildReviewPrompt({ title: 'Маятник' }, 'Маятник для плеча, без оборудования');
    expect(system).toMatch(/faithfulness/);
    expect(system).toMatch(/верность источнику/i);
    expect(user).toContain('Маятник для плеча, без оборудования'); // raw_text внутри
    expect(user).toContain('"title":"Маятник"');
  });

  test('fix-промпт несёт исходник, текущие поля и замечания', () => {
    const { system, user } = buildFixPrompt(
      { title: 'Т', contraindications: 'Грыжа' },
      'Просто наклоны',
      [{ severity: 'critical', field: 'contraindications', message: 'не было в речи', fix: 'убрать' }],
    );
    expect(system).toMatch(/УБЕРИ всё, чего НЕ было/i);
    expect(user).toContain('Просто наклоны');
    expect(user).toContain('contraindications');
    expect(user).toMatch(/не было в речи/);
  });
});

describe('exerciseStructuring — buildSanityPrompt / summarizeSanity', () => {
  test('sanity-промпт: роль реабилитолога, консервативность, только советы (не правит)', () => {
    const { system, user } = buildSanityPrompt({ title: 'Отведение', body_region: 'shoulder' });
    expect(system).toMatch(/реабилитолог/i);
    expect(system).toMatch(/КОНСЕРВАТИВЕН/);
    expect(system).toMatch(/НЕ переписывай/i);
    expect(user).toContain('"title":"Отведение"');
  });

  test('summarizeSanity: нормализует concerns, severity-whitelist, пустые message выкидывает', () => {
    const r = summarizeSanity({
      concerns: [
        { severity: 'high', field: 'progression', message: 'для дельты выше плеч — риск импинджмента' },
        { severity: 'жуть', field: 'x', message: 'm' },
        { severity: 'low', field: 'y', message: '' },
        'мусор',
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.concerns).toHaveLength(2);
    expect(r.concerns[0].severity).toBe('high');
    expect(r.concerns[1].severity).toBe('medium'); // невалидная → medium
  });

  test('summarizeSanity: нет проблем → пустой массив; мусор → ok=false', () => {
    expect(summarizeSanity({ concerns: [] }).concerns).toEqual([]);
    expect(summarizeSanity('не json').ok).toBe(false);
  });
});

describe('exerciseStructuring — buildCompletenessPrompt (агент №5) / buildConsistencyPrompt (№6)', () => {
  test('completeness: проверяет полноту, не выдумывает, формат concerns', () => {
    const { system, user } = buildCompletenessPrompt({ title: 'Изометрия', instructions: 'напрягите' });
    expect(system).toMatch(/ПОЛНОТУ/);
    expect(system).toMatch(/НЕ выдумывай значения/i);
    expect(system).toMatch(/concerns/);
    expect(system).toMatch(/только валидный json/i);
    expect(user).toContain('"title":"Изометрия"');
  });

  test('consistency: форма «вы», стиль; СИНОНИМЫ разрешены (не флагать как разнобой)', () => {
    const { system } = buildConsistencyPrompt({ title: 'X' });
    expect(system).toMatch(/«вы»/);
    expect(system).toMatch(/СИНОНИМЫ/);
    expect(system).toMatch(/НЕ флагуй\s+разные синонимы|УМЕСТНА и ЖЕЛАТЕЛЬНА/i);
    expect(system).toMatch(/НЕ переписывай/i);
    expect(system).toMatch(/concerns/);
  });

  test('оба выхода совместимы с summarizeSanity (тот же контракт concerns)', () => {
    const r = summarizeSanity({ concerns: [{ severity: 'low', field: 'instructions', message: 'нет дыхания' }] });
    expect(r.ok).toBe(true);
    expect(r.concerns[0].field).toBe('instructions');
  });
});

describe('exerciseStructuring — summarizeReview (арифметика в коде)', () => {
  test('высокие баллы без critical → pass=true, weighted считается в коде', () => {
    const r = summarizeReview({
      scores: { faithfulness: 9, safety: 9, clarity: 8, completeness: 7, language: 8 },
      weighted_total: 1.0, // намеренно врём — код игнорирует
      pass: false,
      issues: [],
      summary: 'ок',
    });
    // (9*3 + 9*3 + 8*2 + 7*1 + 8*1)/10 = (27+27+16+7+8)/10 = 85/10 = 8.5
    expect(r.weighted_total).toBe(8.5);
    expect(r.pass).toBe(true);
    expect(r.ok).toBe(true);
  });

  test('critical issue → pass=false даже при высоких баллах', () => {
    const r = summarizeReview({
      scores: { faithfulness: 9, safety: 9, clarity: 9, completeness: 9, language: 9 },
      issues: [{ severity: 'critical', field: 'contraindications', message: 'добавлено от себя' }],
    });
    expect(r.pass).toBe(false);
  });

  test('низкий faithfulness → pass=false', () => {
    const r = summarizeReview({
      scores: { faithfulness: 6, safety: 9, clarity: 9, completeness: 9, language: 9 },
      issues: [],
    });
    expect(r.pass).toBe(false);
  });

  test('низкий safety → pass=false', () => {
    const r = summarizeReview({
      scores: { faithfulness: 9, safety: 6, clarity: 9, completeness: 9, language: 9 },
      issues: [],
    });
    expect(r.pass).toBe(false);
  });

  test('баллы клампятся 0..10, severity нормализуется', () => {
    const r = summarizeReview({
      scores: { faithfulness: 99, safety: -5, clarity: 'x', completeness: 7, language: 8 },
      issues: [{ severity: 'жуть', message: 'm' }],
    });
    expect(r.scores.faithfulness).toBe(10);
    expect(r.scores.safety).toBe(0);
    expect(r.scores.clarity).toBe(0);
    expect(r.issues[0].severity).toBe('suggestion'); // невалидная severity → suggestion
  });

  test('мусор-вход → ok=false', () => {
    const r = summarizeReview('не json');
    expect(r.ok).toBe(false);
    expect(r.pass).toBe(false);
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
    expect(fields.body_region).toEqual(['shoulder']);  // body_region — массив
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
    expect(fields.body_region).toEqual(['shoulder']);  // скаляр-вход коэрсится в 1-эл. массив
    expect(fields.equipment).toEqual(['resistance-band', 'swiss-ball']);
    expect(fields.position).toEqual(['supine']);
    expect(fields.rehab_phases).toEqual(['acute']);
  });

  test('body_region — массив: многосуставное (присед) + синонимы внутри массива', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Присед',
      body_region: ['knee', 'тазобедренный сустав'],
    });
    expect(fields.body_region).toEqual(['knee', 'hip']);  // синоним «тазобедренный сустав» → hip
  });

  test('body_region: дубликаты схлопываются, мусор → warning + отброшен', () => {
    const { fields, warnings } = normalizeStructuredExercise({
      title: 'Т',
      body_region: ['колено', 'knee', 'волшебный сустав'],
    });
    expect(fields.body_region).toEqual(['knee']);
    expect(warnings.join(' ')).toMatch(/волшебный сустав/);
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

  test('instructions «1. .. 2. .. 3.» в одну строку → переносы строк', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Т',
      instructions: '1. Встаньте прямо. 2. Поднимитесь на носки. 3. Опуститесь.',
    });
    expect(fields.instructions).toBe('1. Встаньте прямо.\n2. Поднимитесь на носки.\n3. Опуститесь.');
  });

  test('instructions массивом шагов → склейка переносами строк', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Т',
      instructions: ['1. Шаг один.', '2. Шаг два.'],
    });
    expect(fields.instructions).toBe('1. Шаг один.\n2. Шаг два.');
  });

  test('форматирование шагов НЕ ломает «до 90.» (не последовательность)', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Т',
      instructions: 'Опускайтесь до угла 90. Затем встаньте за 2 счёта.',
    });
    expect(fields.instructions).toBe('Опускайтесь до угла 90. Затем встаньте за 2 счёта.');
  });

  test('variations/progression переносятся как текст (passthrough)', () => {
    const { fields } = normalizeStructuredExercise({
      title: 'Т',
      variations: 'С весом — продвинутый вариант; держась за опору — облегчённый.',
      progression: 'Фаза 1: на двух ногах → фаза 2: на одной → фаза 3: с гантелями.',
    });
    expect(fields.variations).toMatch(/продвинутый вариант/);
    expect(fields.progression).toMatch(/на двух ногах/);
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
    expect(fields.body_region).toEqual(['knee']);
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
    expect(fields.body_region).toEqual(['shoulder']);
  });
});
