// exerciseStructuring.js — ядро фичи «надиктовка упражнения → поля БД».
//
// Делает ДВЕ вещи (обе чистые, без сети — поэтому полностью юнит-тестируемы):
//   1. Держит канонический ЧЕК-ЛИСТ (по нему диктует инструктор + по нему строится
//      промпт + он показывается на фронте как подсказка).
//   2. normalizeStructuredExercise() — валидатор: берёт сырой JSON от LLM (is*ai)
//      и раскладывает его в БЕЗОПАСНЫЕ поля упражнения, маппя значения на whitelist
//      реальной формы (frontend ExerciseModal). Неизвестное — отбрасывает в warnings,
//      ничего не выдумывает.
//
// ВАЖНО: целевые значения enum'ов зеркалят ЛОКАЛЬНЫЕ массивы в
// frontend/src/pages/Exercises/components/ExerciseModal.js (не exerciseConstants.js —
// они расходятся!). Бэкенд POST/PUT /exercises enum'ы не валидирует и пишет значения
// как есть, поэтому если выдать значение, которого нет в чекбоксах формы, — оно
// молча сохранится, но не отрисуется галочкой. Поэтому маппим именно в форму.

'use strict';

// ──────────────────────────────────────────────────────────────────────────
// Канонические whitelist'ы (code → русский label). Зеркало ExerciseModal.
// ──────────────────────────────────────────────────────────────────────────

// <select> «Тип упражнения» в форме — всего 6 опций (НЕ 13 как в exerciseConstants).
const EXERCISE_TYPES = {
  strength: 'Силовое',
  activation: 'Активация',
  mobilization: 'Мобилизация',
  stability: 'Стабилизация',
  proprioception: 'Проприоцепция',
  stretching: 'Растяжка',
};

const BODY_REGIONS = {
  shoulder: 'Плечо',
  knee: 'Колено',
  spine: 'Позвоночник',
  hip: 'Тазобедренный сустав',
  ankle: 'Голеностоп',
  elbow: 'Локоть',
  wrist: 'Запястье',
  full_body: 'Всё тело',
};

const EQUIPMENT = {
  'no-equipment': 'Без оборудования',
  'resistance-band': 'Резиновая лента',
  dumbbell: 'Гантели',
  barbell: 'Штанга',
  'medicine-ball': 'Медицинский мяч',
  trx: 'TRX',
  'foam-roller': 'Ролик',
  'swiss-ball': 'Фитбол',
  kettlebell: 'Гиря',
  cable: 'Кабельный тренажёр',
  bench: 'Скамья',
  wall: 'Стена',
};

const POSITIONS = {
  standing: 'Стоя',
  sitting: 'Сидя',
  lying: 'Лёжа',
  supine: 'Лёжа на спине',
  prone: 'Лёжа на животе',
  'side-lying': 'Лёжа на боку',
  quadruped: 'На четвереньках',
  kneeling: 'На коленях',
};

const REHAB_PHASES = {
  acute: 'Острая фаза',
  subacute: 'Подострая фаза',
  functional: 'Функциональная фаза',
  pre_sport: 'Предспортивная фаза',
  sport: 'Спортивная фаза',
  prevention: 'Профилактика',
};

// ──────────────────────────────────────────────────────────────────────────
// Синонимы (русское слово из расшифровки → канонический code). Защита на случай,
// если LLM отдаст человеческую формулировку вместо кода. Ключи — в нижнем регистре.
// ──────────────────────────────────────────────────────────────────────────

const EXERCISE_TYPE_SYNONYMS = {
  'сила': 'strength', 'силовое': 'strength', 'силовая': 'strength',
  'активация': 'activation',
  'мобилизация': 'mobilization', 'мобильность': 'mobilization',
  'стабилизация': 'stability', 'стабильность': 'stability',
  'проприоцепция': 'proprioception', 'баланс': 'proprioception',
  'растяжка': 'stretching', 'растягивание': 'stretching', 'стретчинг': 'stretching',
};

const BODY_REGION_SYNONYMS = {
  'плечо': 'shoulder', 'плечевой': 'shoulder', 'плечевой сустав': 'shoulder',
  'колено': 'knee', 'коленный': 'knee', 'коленный сустав': 'knee',
  'позвоночник': 'spine', 'спина': 'spine', 'поясница': 'spine',
  'бедро': 'hip', 'тазобедренный': 'hip', 'тазобедренный сустав': 'hip', 'таз': 'hip',
  'голеностоп': 'ankle', 'лодыжка': 'ankle', 'стопа': 'ankle',
  'локоть': 'elbow', 'локтевой': 'elbow',
  'запястье': 'wrist', 'кисть': 'wrist',
  'всё тело': 'full_body', 'все тело': 'full_body', 'тело': 'full_body',
};

const EQUIPMENT_SYNONYMS = {
  'без оборудования': 'no-equipment', 'без инвентаря': 'no-equipment', 'нет': 'no-equipment',
  'резинка': 'resistance-band', 'резиновая лента': 'resistance-band', 'лента': 'resistance-band',
  'эспандер': 'resistance-band', 'резина': 'resistance-band',
  'гантель': 'dumbbell', 'гантели': 'dumbbell', 'гантеля': 'dumbbell',
  'штанга': 'barbell', 'гриф': 'barbell',
  'медбол': 'medicine-ball', 'медицинский мяч': 'medicine-ball', 'мяч': 'medicine-ball',
  'trx': 'trx', 'петли': 'trx',
  'ролик': 'foam-roller', 'ролл': 'foam-roller', 'роллер': 'foam-roller',
  'фитбол': 'swiss-ball', 'мяч гимнастический': 'swiss-ball', 'швейцарский мяч': 'swiss-ball',
  'гиря': 'kettlebell',
  'кабель': 'cable', 'кабельный тренажёр': 'cable', 'блок': 'cable', 'тренажёр': 'cable',
  'скамья': 'bench', 'скамейка': 'bench',
  'стена': 'wall',
};

const POSITION_SYNONYMS = {
  'стоя': 'standing',
  'сидя': 'sitting',
  'лёжа': 'lying', 'лежа': 'lying',
  'лёжа на спине': 'supine', 'лежа на спине': 'supine', 'на спине': 'supine',
  'лёжа на животе': 'prone', 'лежа на животе': 'prone', 'на животе': 'prone',
  'лёжа на боку': 'side-lying', 'лежа на боку': 'side-lying', 'на боку': 'side-lying',
  'на четвереньках': 'quadruped', 'четвереньки': 'quadruped',
  'на коленях': 'kneeling', 'колени': 'kneeling',
};

const REHAB_PHASE_SYNONYMS = {
  'острая': 'acute', 'острая фаза': 'acute',
  'подострая': 'subacute', 'подострая фаза': 'subacute',
  'функциональная': 'functional', 'функциональная фаза': 'functional',
  'предспортивная': 'pre_sport', 'предспортивная фаза': 'pre_sport', 'переход к спорту': 'pre_sport',
  'спортивная': 'sport', 'спортивная фаза': 'sport', 'спорт': 'sport',
  'профилактика': 'prevention',
};

// ──────────────────────────────────────────────────────────────────────────
// Чек-лист надиктовки. key — поле БД; используется и в промпте, и на фронте.
// ──────────────────────────────────────────────────────────────────────────

const CHECKLIST = [
  { key: 'title', label: 'Название упражнения', hint: 'полное, как в библиотеке' },
  { key: 'short_title', label: 'Короткое название', hint: 'для списков (необязательно)' },
  { key: 'body_region', label: 'Регион тела', hint: 'плечо / колено / позвоночник / …' },
  { key: 'exercise_type', label: 'Тип упражнения', hint: 'силовое / мобилизация / стабилизация / …' },
  { key: 'difficulty_level', label: 'Сложность', hint: 'от 1 (легко) до 5 (сложно)' },
  { key: 'equipment', label: 'Оборудование', hint: 'резинка / гантель / без оборудования / …' },
  { key: 'position', label: 'Исходное положение', hint: 'стоя / сидя / лёжа на спине / …' },
  { key: 'rehab_phases', label: 'Фазы реабилитации', hint: 'острая / функциональная / …' },
  { key: 'description', label: 'Описание', hint: 'что это за упражнение, своими словами' },
  { key: 'instructions', label: 'Как выполнять', hint: 'по шагам' },
  { key: 'cues', label: 'Ключевые подсказки (cues)', hint: 'что говорить во время выполнения' },
  { key: 'tips', label: 'Полезно знать', hint: 'на что обратить внимание' },
  { key: 'contraindications', label: 'Противопоказания', hint: 'когда НЕ делать' },
];

// Поля свободного текста — переносятся как есть (источник = речь эксперта).
const FREE_TEXT_FIELDS = ['title', 'short_title', 'description', 'instructions', 'cues', 'tips', 'contraindications'];

// ──────────────────────────────────────────────────────────────────────────
// Глоссарий упрощения терминов (термин эксперта → простыми словами). Применяется
// ТОЛЬКО к пациент-тексту (description). В instructions/cues — точные термины
// сохраняются (это технические поля выполнения). Расширен из прототипа ExerciseBot.
// ──────────────────────────────────────────────────────────────────────────

const TERM_GLOSSARY = [
  ['квадрицепс', 'передняя поверхность бедра'],
  ['хамстринг', 'задняя поверхность бедра'],
  ['бицепс бедра', 'задняя поверхность бедра'],
  ['абдукция', 'отведение в сторону'],
  ['аддукция', 'приведение'],
  ['ротация', 'вращение'],
  ['флексия', 'сгибание'],
  ['экстензия', 'разгибание'],
  ['пронация', 'поворот внутрь'],
  ['супинация', 'поворот наружу'],
  ['нейтральная позиция', 'ровное положение'],
  ['коконтракция', 'одновременное напряжение мышц'],
  ['проприоцепция', 'чувство баланса'],
  ['эксцентрика', 'медленное опускание под нагрузкой'],
  ['концентрика', 'подъём с усилием'],
];

// ──────────────────────────────────────────────────────────────────────────
// Промпт для LLM (DeepSeek/is*ai). Жёстко: только структурируй сказанное, не
// выдумывай клинику, не названо — оставь пустым, значения enum — только из
// списков, ответ — чистый JSON. Клиническую глубину (шаги/дыхание/темп/акценты/
// ошибки) раскладываем В НАШИ существующие текстовые поля (без новой схемы).
// ──────────────────────────────────────────────────────────────────────────

function listForPrompt(obj) {
  return Object.entries(obj).map(([code, ru]) => `${code} (${ru})`).join(', ');
}

// Few-shot примеры «диктовка → JSON». Критичны для лёгких моделей (deepseek-v4-flash):
// показывают маппинг enum-кодов, нормализацию чисел словами и принцип «не выдумывай».
const FEW_SHOT_EXAMPLES = [
  {
    transcript:
      'Маятник для плеча. Без оборудования, стоя. Наклоняешься вперёд, здоровой рукой '
      + 'опираешься на стол, больная рука свободно свисает и раскачивается по кругу, расслабленно. '
      + 'Это мобилизация, ранняя фаза после операции. Дыши свободно. Не делать при острой боли.',
    json: {
      title: 'Маятник для плеча',
      body_region: 'shoulder',
      exercise_type: 'mobilization',
      equipment: ['no-equipment'],
      position: ['standing'],
      rehab_phases: ['acute'],
      description:
        'Расслабляющее маятниковое упражнение для плеча: рука свободно свисает и раскачивается по кругу.',
      instructions:
        '1. Наклонитесь вперёд, здоровой рукой обопритесь на стол. '
        + '2. Дайте больной руке свободно свисать. '
        + '3. Раскачивайте руку по кругу, не напрягая плечо. Дыхание свободное.',
      cues: 'Рука полностью расслаблена, движение идёт за счёт корпуса.',
      contraindications: 'Острая боль в плече.',
    },
  },
  {
    transcript:
      'Разгибание колена сидя с резинкой, силовое, колено, функциональная фаза, сложность три. '
      + 'Три подхода по пятнадцать повторений.',
    json: {
      title: 'Разгибание колена сидя с резинкой',
      body_region: 'knee',
      exercise_type: 'strength',
      equipment: ['resistance-band'],
      position: ['sitting'],
      rehab_phases: ['functional'],
      difficulty_level: 3,
      description:
        'Силовое упражнение на разгибание колена сидя с сопротивлением резиновой ленты.',
      instructions: 'Разгибайте колено, преодолевая сопротивление резинки. 3 подхода по 15 повторений.',
    },
  },
];

function buildStructuringPrompt(transcript) {
  const glossaryLines = TERM_GLOSSARY.map(([term, plain]) => `   - ${term} → ${plain}`).join('\n');

  const system = [
    'Ты — помощник-структуризатор для библиотеки упражнений физио-студии Azarean.',
    'Тебе дают РАСШИФРОВКУ надиктовки инструктора об одном упражнении.',
    'Твоя задача — РАЗЛОЖИТЬ сказанное по полям и вернуть валидный JSON. СТРОГИЕ ПРАВИЛА:',
    '',
    '1. НИЧЕГО НЕ ВЫДУМЫВАЙ. Если о поле не сказано — НЕ включай его в ответ.',
    '   Особенно: противопоказания, углы, подходы/повторения, дыхание, темп — только если прозвучали.',
    '   Источник правды — речь эксперта. Ты чистишь и раскладываешь, но НЕ добавляешь клинику.',
    '2. Текстовые поля — близко к оригиналу: убери слова-паразиты, повторы, незаконченные мысли;',
    '   оформи аккуратно. Шаги выполнения — нумерованным списком «1. … 2. …» в instructions.',
    '3. Числа, названные словами, переводи в цифры («три подхода по пятнадцать» → «3 подхода по 15»).',
    '   difficulty_level — целое 1..5 (если сказано «средняя» ≈ 3, «лёгкое» ≈ 1–2, «тяжёлое» ≈ 4–5).',
    '4. Значения классификаторов бери ТОЛЬКО из разрешённых кодов (ниже). Не подходит ни один — не включай поле.',
    '5. Если расшифровка НЕ про упражнение (бытовая речь, мусор, неразборчиво) — верни',
    '   {"needs_clarification": "<коротко чего не хватает>"} и НЕ выдумывай поля.',
    '6. Ответ — ТОЛЬКО валидный JSON-объект, без markdown, без комментариев, без текста вокруг.',
    '',
    'Куда что раскладывать (в НАШИ поля, новых не выдумывай):',
    '   - общий смысл упражнения → description (простым языком, для пациента);',
    '   - шаги выполнения (+ дыхание и темп, если названы) → instructions;',
    '   - ключевые акценты «на что обратить внимание во время» → cues;',
    '   - типичные ошибки / полезные заметки → tips;',
    '   - когда НЕ делать → contraindications.',
    '',
    'Упрощение терминов — ТОЛЬКО в description (для пациента). В instructions/cues оставляй точные термины.',
    glossaryLines,
    '',
    'Разрешённые коды:',
    `- exercise_type (один): ${listForPrompt(EXERCISE_TYPES)}`,
    `- body_region (один): ${listForPrompt(BODY_REGIONS)}`,
    '- difficulty_level: целое 1..5',
    `- equipment (массив): ${listForPrompt(EQUIPMENT)}`,
    `- position (массив): ${listForPrompt(POSITIONS)}`,
    `- rehab_phases (массив): ${listForPrompt(REHAB_PHASES)}`,
    '',
    'Текстовые поля (строки): title, short_title, description, instructions, cues, tips, contraindications.',
    'Формат ответа — JSON с подмножеством ключей: title, short_title, description, exercise_type, body_region,',
    'difficulty_level, equipment, position, rehab_phases, instructions, cues, tips, contraindications.',
    '',
    'Примеры (диктовка → JSON):',
    ...FEW_SHOT_EXAMPLES.map(
      (ex) => `Диктовка: «${ex.transcript}»\nОтвет: ${JSON.stringify(ex.json, null, 0)}`,
    ),
  ].join('\n');

  const user = `Расшифровка надиктовки:\n"""\n${String(transcript || '').trim()}\n"""`;
  return { system, user };
}

// ──────────────────────────────────────────────────────────────────────────
// Парсинг JSON из ответа модели (на случай ```json … ``` или текста вокруг).
// ──────────────────────────────────────────────────────────────────────────

function parseModelJson(text) {
  if (text && typeof text === 'object') return text; // уже распарсено
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  // 1) попытка как есть
  try { return JSON.parse(trimmed); } catch (_) { /* далее */ }
  // 2) вырезать содержимое первого {...} блока
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const slice = trimmed.slice(first, last + 1);
    try { return JSON.parse(slice); } catch (_) { /* нет */ }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Хелперы маппинга значений на whitelist.
// ──────────────────────────────────────────────────────────────────────────

function mapScalar(value, allowed, synonyms) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(allowed, raw)) return raw;       // уже валидный code
  if (Object.prototype.hasOwnProperty.call(allowed, lower)) return lower;
  if (Object.prototype.hasOwnProperty.call(synonyms, lower)) return synonyms[lower];
  return null; // не распознано
}

function mapArray(value, allowed, synonyms, warnings, fieldName) {
  const arr = Array.isArray(value) ? value : (value == null ? [] : [value]);
  const out = [];
  for (const item of arr) {
    const code = mapScalar(item, allowed, synonyms);
    if (code && !out.includes(code)) {
      out.push(code);
    } else if (!code && item != null && String(item).trim()) {
      warnings.push(`${fieldName}: не распознано «${String(item).trim()}» — пропущено`);
    }
  }
  return out;
}

function cleanText(value) {
  if (value == null) return null;
  // Модель иногда отдаёт текстовое поле массивом (напр. contraindications:
  // ["острая боль", "вывих"]) — склеиваем по-человечески, а не через toString.
  if (Array.isArray(value)) {
    const joined = value
      .map((x) => (x == null ? '' : String(x).trim()))
      .filter(Boolean)
      .join(', ');
    return joined || null;
  }
  const s = String(value).trim();
  return s ? s : null;
}

// ──────────────────────────────────────────────────────────────────────────
// Главное: сырой JSON LLM → { fields, warnings }.
// fields содержит ТОЛЬКО распознанные/осмысленные поля (частичный объект для
// предзаполнения формы). Массивы equipment/position/rehab_phases включаются
// только если непустые. Ничего не выдумывается.
// ──────────────────────────────────────────────────────────────────────────

function normalizeStructuredExercise(raw) {
  const warnings = [];
  const data = parseModelJson(raw);
  if (!data || typeof data !== 'object') {
    return { fields: {}, warnings: ['Не удалось разобрать ответ модели как JSON'] };
  }

  // Guard на мусор/не-упражнение: модель сигналит needs_clarification вместо
  // выдуманных полей. Возвращаем пустые fields + понятный warning для UI.
  const clarify = cleanText(data.needs_clarification);
  if (clarify && Object.keys(data).every((k) => k === 'needs_clarification')) {
    return { fields: {}, warnings: [`Похоже, это не описание упражнения: ${clarify}`] };
  }

  const fields = {};

  // Текстовые поля — passthrough (источник = эксперт).
  for (const key of FREE_TEXT_FIELDS) {
    const v = cleanText(data[key]);
    if (v) fields[key] = v;
  }

  // exercise_type / body_region — скаляры на whitelist.
  const et = mapScalar(data.exercise_type, EXERCISE_TYPES, EXERCISE_TYPE_SYNONYMS);
  if (et) fields.exercise_type = et;
  else if (data.exercise_type != null && String(data.exercise_type).trim()) {
    warnings.push(`exercise_type: не распознано «${String(data.exercise_type).trim()}»`);
  }

  const br = mapScalar(data.body_region, BODY_REGIONS, BODY_REGION_SYNONYMS);
  if (br) fields.body_region = br;
  else if (data.body_region != null && String(data.body_region).trim()) {
    warnings.push(`body_region: не распознано «${String(data.body_region).trim()}»`);
  }

  // difficulty_level — целое 1..5 (clamp). Включаем только если задано числом.
  if (data.difficulty_level != null && data.difficulty_level !== '') {
    const n = Math.round(Number(data.difficulty_level));
    if (Number.isFinite(n)) {
      fields.difficulty_level = Math.min(5, Math.max(1, n));
    } else {
      warnings.push(`difficulty_level: не число «${String(data.difficulty_level)}»`);
    }
  }

  // Массивы.
  const equipment = mapArray(data.equipment, EQUIPMENT, EQUIPMENT_SYNONYMS, warnings, 'equipment');
  if (equipment.length) fields.equipment = equipment;

  const position = mapArray(data.position, POSITIONS, POSITION_SYNONYMS, warnings, 'position');
  if (position.length) fields.position = position;

  const rehabPhases = mapArray(data.rehab_phases, REHAB_PHASES, REHAB_PHASE_SYNONYMS, warnings, 'rehab_phases');
  if (rehabPhases.length) fields.rehab_phases = rehabPhases;

  // Мягкая подсказка о полноте — title критичен для сохранения.
  if (!fields.title) warnings.push('title: название не распознано — заполните вручную');

  return { fields, warnings };
}

module.exports = {
  // данные
  CHECKLIST,
  EXERCISE_TYPES,
  BODY_REGIONS,
  EQUIPMENT,
  POSITIONS,
  REHAB_PHASES,
  FREE_TEXT_FIELDS,
  TERM_GLOSSARY,
  // функции
  buildStructuringPrompt,
  parseModelJson,
  normalizeStructuredExercise,
};
