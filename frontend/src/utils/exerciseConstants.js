// exerciseConstants.js - Константы для библиотеки упражнений
// Azarean Network - v2.0 (исправленный формат)

// =====================================================
// КОНСТАНТЫ В ФОРМАТЕ ОБЪЕКТОВ (для прямого доступа)
// Использование: BODY_REGIONS[exercise.body_region]
// =====================================================

export const BODY_REGIONS = {
  shoulder: 'Плечо',
  knee: 'Колено',
  hip: 'Тазобедренный сустав',
  spine: 'Позвоночник',
  ankle: 'Голеностоп',
  elbow: 'Локоть',
  wrist: 'Кисть',
  full_body: 'Всё тело'
};

export const EXERCISE_TYPES = {
  strength: 'Сила',
  activation: 'Активация',
  mobilization: 'Мобилизация',
  proprioception: 'Проприоцепция',
  balance: 'Баланс',
  plyometrics: 'Плиометрика',
  stretching: 'Растяжка',
  cardio: 'Кардио',
  coordination: 'Координация',
  relaxation_breathing: 'Расслабление/Дыхание',
  stabilization: 'Стабилизация',
  isometric: 'Изометрия',
  functional_patterns: 'Функциональные паттерны'
};

export const DIFFICULTY_LEVELS = {
  1: 'Очень легко',
  2: 'Легко',
  3: 'Средне',
  4: 'Сложно',
  5: 'Очень сложно'
};

export const EQUIPMENT_OPTIONS = {
  'no-equipment': 'Без оборудования',
  band: 'Резинка',
  dumbbell: 'Гантель',
  barbell: 'Штанга',
  ball: 'Мяч',
  trx: 'TRX',
  foam_roller: 'Ролл',
  step: 'Степ',
  bosu: 'BOSU',
  kettlebell: 'Гиря',
  medicine_ball: 'Медбол',
  cable: 'Кабельный тренажёр',
  bench: 'Скамья',
  wall: 'Стена',
  chair: 'Стул'
};

export const POSITION_OPTIONS = {
  lying: 'Лёжа',
  sitting: 'Сидя',
  standing: 'Стоя',
  quadruped: 'На четвереньках',
  prone: 'На животе',
  supine: 'На спине',
  side_lying: 'На боку',
  kneeling: 'На коленях',
  half_kneeling: 'Полуприсед'
};

export const CHAIN_TYPES = {
  open: 'Открытая цепь',
  closed: 'Закрытая цепь',
  mixed: 'Смешанная'
};

export const REHAB_PHASES = {
  acute: 'Острая фаза',
  subacute: 'Подострая фаза',
  functional: 'Функциональная фаза',
  pre_sport: 'Переход к спорту',
  sport: 'Спортивная фаза',
  prevention: 'Профилактика'
};

export const PRESET_GOALS = {
  pain_relief: 'Снятие боли',
  mobility: 'Подвижность',
  strength: 'Сила',
  power: 'Мощность',
  endurance: 'Выносливость',
  neuromuscular: 'Нейромышечный контроль'
};

export const MOVEMENT_PATTERNS = {
  push: 'Толкание',
  pull: 'Тяга',
  squat: 'Приседание',
  hinge: 'Наклон',
  lunge: 'Выпад',
  rotation: 'Вращение',
  carry: 'Перенос',
  locomotion: 'Локомоция'
};

export const JOINT_OPTIONS = {
  glenohumeral: 'Плечевой сустав',
  scapulothoracic: 'Лопаточно-грудное сочленение',
  acromioclavicular: 'Акромиально-ключичный',
  sternoclavicular: 'Грудино-ключичный',
  elbow: 'Локтевой сустав',
  wrist: 'Лучезапястный сустав',
  hip: 'Тазобедренный сустав',
  knee: 'Коленный сустав',
  ankle: 'Голеностопный сустав',
  lumbar: 'Поясничный отдел',
  thoracic: 'Грудной отдел',
  cervical: 'Шейный отдел'
};

// =====================================================
// МАССИВЫ ДЛЯ SELECT OPTIONS
// Использование: в <select> для генерации <option>
// =====================================================

export const BODY_REGIONS_OPTIONS = [
  { value: 'shoulder', label: 'Плечо' },
  { value: 'knee', label: 'Колено' },
  { value: 'hip', label: 'Тазобедренный сустав' },
  { value: 'spine', label: 'Позвоночник' },
  { value: 'ankle', label: 'Голеностоп' },
  { value: 'elbow', label: 'Локоть' },
  { value: 'wrist', label: 'Кисть' },
  { value: 'full_body', label: 'Всё тело' }
];

export const EXERCISE_TYPES_OPTIONS = [
  { value: 'strength', label: 'Сила' },
  { value: 'activation', label: 'Активация' },
  { value: 'mobilization', label: 'Мобилизация' },
  { value: 'proprioception', label: 'Проприоцепция' },
  { value: 'balance', label: 'Баланс' },
  { value: 'plyometrics', label: 'Плиометрика' },
  { value: 'stretching', label: 'Растяжка' },
  { value: 'cardio', label: 'Кардио' },
  { value: 'coordination', label: 'Координация' },
  { value: 'relaxation_breathing', label: 'Расслабление/Дыхание' },
  { value: 'stabilization', label: 'Стабилизация' },
  { value: 'isometric', label: 'Изометрия' },
  { value: 'functional_patterns', label: 'Функциональные паттерны' }
];

export const DIFFICULTY_LEVELS_OPTIONS = [
  { value: 1, label: 'Очень легко' },
  { value: 2, label: 'Легко' },
  { value: 3, label: 'Средне' },
  { value: 4, label: 'Сложно' },
  { value: 5, label: 'Очень сложно' }
];

export const EQUIPMENT_OPTIONS_LIST = [
  { value: 'no-equipment', label: 'Без оборудования' },
  { value: 'band', label: 'Резинка' },
  { value: 'dumbbell', label: 'Гантель' },
  { value: 'barbell', label: 'Штанга' },
  { value: 'ball', label: 'Мяч' },
  { value: 'trx', label: 'TRX' },
  { value: 'foam_roller', label: 'Ролл' },
  { value: 'step', label: 'Степ' },
  { value: 'bosu', label: 'BOSU' },
  { value: 'kettlebell', label: 'Гиря' },
  { value: 'medicine_ball', label: 'Медбол' },
  { value: 'cable', label: 'Кабельный тренажёр' },
  { value: 'bench', label: 'Скамья' },
  { value: 'wall', label: 'Стена' },
  { value: 'chair', label: 'Стул' }
];

export const POSITION_OPTIONS_LIST = [
  { value: 'lying', label: 'Лёжа' },
  { value: 'sitting', label: 'Сидя' },
  { value: 'standing', label: 'Стоя' },
  { value: 'quadruped', label: 'На четвереньках' },
  { value: 'prone', label: 'На животе' },
  { value: 'supine', label: 'На спине' },
  { value: 'side_lying', label: 'На боку' },
  { value: 'kneeling', label: 'На коленях' },
  { value: 'half_kneeling', label: 'Полуприсед' }
];

export const CHAIN_TYPES_OPTIONS = [
  { value: 'open', label: 'Открытая цепь' },
  { value: 'closed', label: 'Закрытая цепь' },
  { value: 'mixed', label: 'Смешанная' }
];

export const REHAB_PHASES_OPTIONS = [
  { value: 'acute', label: 'Острая фаза' },
  { value: 'subacute', label: 'Подострая фаза' },
  { value: 'functional', label: 'Функциональная фаза' },
  { value: 'pre_sport', label: 'Переход к спорту' },
  { value: 'sport', label: 'Спортивная фаза' },
  { value: 'prevention', label: 'Профилактика' }
];

export const PRESET_GOALS_OPTIONS = [
  { value: 'pain_relief', label: 'Снятие боли' },
  { value: 'mobility', label: 'Подвижность' },
  { value: 'strength', label: 'Сила' },
  { value: 'power', label: 'Мощность' },
  { value: 'endurance', label: 'Выносливость' },
  { value: 'neuromuscular', label: 'Нейромышечный контроль' }
];

// =====================================================
// УТИЛИТЫ ДЛЯ РАБОТЫ С КОНСТАНТАМИ
// =====================================================

/**
 * Получить label по value из объекта констант
 * @param {string|number} value - значение
 * @param {object} constantsObj - объект констант
 * @returns {string} label или value если не найден
 */
export const getLabel = (value, constantsObj) => {
  return constantsObj[value] || value || '—';
};

// Хелперы для каждого типа
export const getExerciseTypeLabel = (value) => getLabel(value, EXERCISE_TYPES);
export const getBodyRegionLabel = (value) => getLabel(value, BODY_REGIONS);
export const getDifficultyLabel = (value) => getLabel(value, DIFFICULTY_LEVELS);
export const getEquipmentLabel = (value) => getLabel(value, EQUIPMENT_OPTIONS);
export const getPositionLabel = (value) => getLabel(value, POSITION_OPTIONS);
export const getChainTypeLabel = (value) => getLabel(value, CHAIN_TYPES);
export const getRehabPhaseLabel = (value) => getLabel(value, REHAB_PHASES);
export const getPresetGoalLabel = (value) => getLabel(value, PRESET_GOALS);
export const getMovementPatternLabel = (value) => getLabel(value, MOVEMENT_PATTERNS);
export const getJointLabel = (value) => getLabel(value, JOINT_OPTIONS);

/**
 * Конвертировать объект в массив options для select
 * @param {object} obj - объект констант
 * @returns {array} массив {value, label}
 */
export const objectToOptions = (obj) => {
  return Object.entries(obj).map(([value, label]) => ({ value, label }));
};

// =====================================================
// ЦВЕТА ДЛЯ UI
// =====================================================

export const DIFFICULTY_COLORS = {
  1: '#48bb78', // зелёный
  2: '#68d391', // светло-зелёный
  3: '#ecc94b', // жёлтый
  4: '#ed8936', // оранжевый
  5: '#f56565'  // красный
};

export const PHASE_COLORS = {
  acute: '#f56565',      // красный
  subacute: '#ed8936',   // оранжевый
  functional: '#ecc94b', // жёлтый
  pre_sport: '#48bb78',  // зелёный
  sport: '#4299e1',      // синий
  prevention: '#9f7aea'  // фиолетовый
};

export const BODY_REGION_ICONS = {
  shoulder: '💪',
  knee: '🦵',
  hip: '🏃',
  spine: '🧘',
  ankle: '🦶',
  elbow: '💪',
  wrist: '✋',
  full_body: '🏋️'
};