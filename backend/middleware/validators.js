/**
 * Валидаторы входных данных (express-validator)
 * Azarean Network - безопасность 152-ФЗ
 */

const { body, param, query, validationResult } = require('express-validator');

// =====================================================
// ОБРАБОТЧИК ОШИБОК ВАЛИДАЦИИ
// =====================================================

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Ошибка валидации данных',
      details: errors.array().map(e => ({
        field: e.path,
        message: e.msg,
        value: e.value !== undefined ? '[скрыто]' : undefined
      }))
    });
  }
  next();
};

// =====================================================
// ВАЛИДАТОРЫ ДЛЯ AUTH
// =====================================================

const registerValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email обязателен')
    .isEmail().withMessage('Некорректный формат email')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email слишком длинный'),

  body('password')
    .notEmpty().withMessage('Пароль обязателен')
    .isLength({ min: 8 }).withMessage('Пароль минимум 8 символов')
    .matches(/[A-Z]/).withMessage('Пароль должен содержать заглавную букву')
    .matches(/[a-z]/).withMessage('Пароль должен содержать строчную букву')
    .matches(/[0-9]/).withMessage('Пароль должен содержать цифру'),

  body('full_name')
    .trim()
    .notEmpty().withMessage('ФИО обязательно')
    .isLength({ min: 2, max: 100 }).withMessage('ФИО от 2 до 100 символов')
    .matches(/^[а-яА-ЯёЁa-zA-Z\s\-\.]+$/u).withMessage('ФИО содержит недопустимые символы'),

  body('role')
    .optional()
    .isIn(['instructor', 'admin']).withMessage('Недопустимая роль'),

  handleValidationErrors
];

const loginValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email обязателен')
    .isEmail().withMessage('Некорректный формат email')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Пароль обязателен'),

  handleValidationErrors
];

// =====================================================
// ВАЛИДАТОРЫ ДЛЯ PATIENTS
// =====================================================

const patientValidator = [
  body('full_name')
    .trim()
    .notEmpty().withMessage('ФИО пациента обязательно')
    .isLength({ min: 2, max: 100 }).withMessage('ФИО от 2 до 100 символов')
    .matches(/^[а-яА-ЯёЁa-zA-Z\s\-\.]+$/u).withMessage('ФИО содержит недопустимые символы'),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isEmail().withMessage('Некорректный email')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email слишком длинный'),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^\+?[0-9\s\-\(\)]{7,20}$/).withMessage('Некорректный телефон'),

  body('birth_date')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage('Некорректная дата рождения (формат: YYYY-MM-DD)'),

  body('diagnosis')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Диагноз слишком длинный'),

  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Заметки слишком длинные'),

  handleValidationErrors
];

// =====================================================
// ВАЛИДАТОРЫ ДЛЯ PROGRESS
// =====================================================

const progressValidator = [
  body('complex_id')
    .notEmpty().withMessage('ID комплекса обязателен')
    .isInt({ min: 1 }).withMessage('ID комплекса должен быть положительным числом'),

  body('exercise_id')
    .notEmpty().withMessage('ID упражнения обязателен')
    .isInt({ min: 1 }).withMessage('ID упражнения должен быть положительным числом'),

  body('completed')
    .optional()
    .isBoolean().withMessage('completed должен быть boolean'),

  body('pain_level')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 10 }).withMessage('pain_level должен быть от 0 до 10'),

  body('difficulty_rating')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 10 }).withMessage('difficulty_rating должен быть от 1 до 10'),

  body('session_id')
    .optional({ nullable: true })
    .isUUID(4).withMessage('session_id должен быть UUID'),

  body('session_comment')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Комментарий до 1000 символов'),

  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Заметки до 1000 символов'),

  handleValidationErrors
];

// =====================================================
// ВАЛИДАТОРЫ ДЛЯ EXERCISES
// =====================================================

const exerciseValidator = [
  body('title')
    .trim()
    .notEmpty().withMessage('Название упражнения обязательно')
    .isLength({ min: 2, max: 200 }).withMessage('Название от 2 до 200 символов'),

  body('video_url')
    .trim()
    .notEmpty().withMessage('URL видео обязателен')
    .isURL().withMessage('Некорректный URL видео'),

  body('short_title')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Короткое название до 100 символов'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 5000 }).withMessage('Описание до 5000 символов'),

  body('body_region')
    .optional({ nullable: true })
    .isIn(['shoulder', 'knee', 'spine', 'hip', 'other']).withMessage('Недопустимая область тела'),

  body('difficulty_level')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 5 }).withMessage('Уровень сложности от 1 до 5'),

  body('equipment')
    .optional({ nullable: true })
    .isArray().withMessage('equipment должен быть массивом'),

  body('position')
    .optional({ nullable: true })
    .isArray().withMessage('position должен быть массивом'),

  body('rehab_phases')
    .optional({ nullable: true })
    .isArray().withMessage('rehab_phases должен быть массивом'),

  handleValidationErrors
];

// =====================================================
// ВАЛИДАТОРЫ ДЛЯ COMPLEXES
// =====================================================

const complexValidator = [
  body('patient_id')
    .notEmpty().withMessage('ID пациента обязателен')
    .isInt({ min: 1 }).withMessage('ID пациента должен быть положительным числом'),

  body('exercises')
    .isArray({ min: 1 }).withMessage('Необходимо добавить хотя бы одно упражнение'),

  body('exercises.*.exercise_id')
    .isInt({ min: 1 }).withMessage('ID упражнения должен быть положительным числом'),

  body('exercises.*.sets')
    .optional()
    .isInt({ min: 1, max: 20 }).withMessage('Количество подходов от 1 до 20'),

  body('exercises.*.reps')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Количество повторений от 1 до 100'),

  body('exercises.*.duration_seconds')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 3600 }).withMessage('Длительность от 0 до 3600 секунд'),

  body('exercises.*.rest_seconds')
    .optional()
    .isInt({ min: 0, max: 600 }).withMessage('Отдых от 0 до 600 секунд'),

  body('diagnosis_id')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('ID диагноза должен быть положительным числом'),

  body('recommendations')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Рекомендации до 2000 символов'),

  body('warnings')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Предупреждения до 2000 символов'),

  handleValidationErrors
];

// =====================================================
// ВАЛИДАТОРЫ ДЛЯ DIAGNOSES
// =====================================================

const diagnosisValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Название диагноза обязательно')
    .isLength({ min: 2, max: 200 }).withMessage('Название от 2 до 200 символов'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Описание до 2000 символов'),

  body('recommendations')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Рекомендации до 2000 символов'),

  body('warnings')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Предупреждения до 2000 символов'),

  handleValidationErrors
];

// =====================================================
// ВАЛИДАТОРЫ ID ПАРАМЕТРОВ
// =====================================================

const idParamValidator = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID должен быть положительным числом'),
  handleValidationErrors
];

const patientIdParamValidator = [
  param('patientId')
    .isInt({ min: 1 }).withMessage('ID пациента должен быть положительным числом'),
  handleValidationErrors
];

const complexIdParamValidator = [
  param('complex_id')
    .isInt({ min: 1 }).withMessage('ID комплекса должен быть положительным числом'),
  handleValidationErrors
];

// =====================================================
// ЭКСПОРТ
// =====================================================

module.exports = {
  handleValidationErrors,
  // Auth
  registerValidator,
  loginValidator,
  // Patients
  patientValidator,
  // Progress
  progressValidator,
  // Exercises
  exerciseValidator,
  // Complexes
  complexValidator,
  // Diagnoses
  diagnosisValidator,
  // ID params
  idParamValidator,
  patientIdParamValidator,
  complexIdParamValidator
};
