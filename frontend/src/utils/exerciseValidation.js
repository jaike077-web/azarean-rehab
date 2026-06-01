// =====================================================
// Валидация и нормализация полей упражнения в комплексе.
// CP2b (TZ_TIMER_AUDIO_TIMESETS): time-sets + темп.
//
// Используется CreateComplex.js и EditComplex.js — общая логика
// чтобы инструктор видел одинаковые ошибки в обеих формах.
//
// Pure functions (Rule #37) — тестируются отдельно через jest.
// =====================================================

import { buildExerciseAudioPayload } from './exerciseAudio';

/**
 * Возвращает int если value — конечное число > 0, иначе null.
 * Защита от строки 'abc' / undefined / 0 / отрицательных значений.
 */
export function toPositiveInt(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Возвращает int если value — конечное число >= 0, иначе null.
 * Для tempo_pause_s — пауза может быть 0.
 */
export function toNonNegativeInt(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// Темп-границы (зеркало chk_ce_tempo из миграции 20260527).
export const TEMPO_BOUNDS = {
  ECC_MIN: 1, ECC_MAX: 30,
  PAUSE_MIN: 0, PAUSE_MAX: 30,
  CON_MIN: 1, CON_MAX: 30,
};

/**
 * Валидирует одну строку упражнения. Возвращает объект ошибок:
 *   { prescription?: string, tempo?: string }
 * Пустой объект {} = ошибок нет.
 *
 * Правила:
 *   - "prescription" — должно быть задано reps ИЛИ duration_seconds (зеркало
 *     chk_ce_has_prescription). Это UX-guard: не дать сохранить пустой подход.
 *   - "tempo" — три темп-поля либо все NULL, либо все заданы в пределах
 *     [1..30] для ecc/con и [0..30] для pause (зеркало chk_ce_tempo).
 *     Частичный темп → ошибка до сабмита, не 500 от CHECK.
 */
export function validateExerciseRow(exercise) {
  const errors = {};

  const reps = toPositiveInt(exercise.reps);
  const dur = toPositiveInt(exercise.duration_seconds);
  if (reps == null && dur == null) {
    errors.prescription = 'Укажите повторы или время';
  }

  // Темп — считаем что задан если хоть одно из 3 непусто.
  const ecc = exercise.tempo_eccentric_s;
  const pause = exercise.tempo_pause_s;
  const con = exercise.tempo_concentric_s;
  const anySet = (v) => v !== '' && v != null && !Number.isNaN(Number(v));
  const tempoTouched = anySet(ecc) || anySet(pause) || anySet(con);

  if (tempoTouched) {
    const eccN = toPositiveInt(ecc);
    const pauseN = toNonNegativeInt(pause);
    const conN = toPositiveInt(con);

    if (eccN == null || pauseN == null || conN == null) {
      errors.tempo = 'Заполните все три темп-поля или очистите их';
    } else if (
      eccN < TEMPO_BOUNDS.ECC_MIN || eccN > TEMPO_BOUNDS.ECC_MAX ||
      pauseN < TEMPO_BOUNDS.PAUSE_MIN || pauseN > TEMPO_BOUNDS.PAUSE_MAX ||
      conN < TEMPO_BOUNDS.CON_MIN || conN > TEMPO_BOUNDS.CON_MAX
    ) {
      errors.tempo = `Темп: ecc ${TEMPO_BOUNDS.ECC_MIN}–${TEMPO_BOUNDS.ECC_MAX}, пауза ${TEMPO_BOUNDS.PAUSE_MIN}–${TEMPO_BOUNDS.PAUSE_MAX}, conc ${TEMPO_BOUNDS.CON_MIN}–${TEMPO_BOUNDS.CON_MAX} с`;
    }
  }

  return errors;
}

/**
 * Нормализует упражнение в payload для POST/PUT /api/complexes.
 *   - reps/duration_seconds → null (не 0!) если пустое или 0. Бэкенд
 *     ловит и нормализует, но фронт обязан слать честное null после
 *     снятия XOR (TZ CP2b уточнение #2).
 *   - sets: число > 0 или дефолт 3
 *   - rest_seconds: число >= 0 или дефолт 30
 *   - auto_complete: boolean (если не указано — true, как DEFAULT в БД).
 *   - tempo_*: int или null. Если хотя бы одно не валидно — все null
 *     (соблюдаем "всё-или-ничего" из chk_ce_tempo).
 *
 * Принимает order_number отдельно — у Create/Edit разные источники.
 */
export function normalizeExerciseForPayload(exercise, orderNumber) {
  const setsNum = toPositiveInt(exercise.sets);
  const restNum = toNonNegativeInt(exercise.rest_seconds);

  const eccN = toPositiveInt(exercise.tempo_eccentric_s);
  const pauseN = toNonNegativeInt(exercise.tempo_pause_s);
  const conN = toPositiveInt(exercise.tempo_concentric_s);
  const allTempoValid = eccN != null && pauseN != null && conN != null
    && eccN <= TEMPO_BOUNDS.ECC_MAX
    && pauseN <= TEMPO_BOUNDS.PAUSE_MAX
    && conN <= TEMPO_BOUNDS.CON_MAX;

  return {
    exercise_id: exercise.id ?? exercise.exercise_id,
    order_number: orderNumber,
    sets: setsNum != null ? setsNum : 3,
    reps: toPositiveInt(exercise.reps),
    duration_seconds: toPositiveInt(exercise.duration_seconds),
    rest_seconds: restNum != null ? restNum : 30,
    notes: exercise.notes || null,
    auto_complete: typeof exercise.auto_complete === 'boolean'
      ? exercise.auto_complete
      : true,
    tempo_eccentric_s: allTempoValid ? eccN : null,
    tempo_pause_s: allTempoValid ? pauseN : null,
    tempo_concentric_s: allTempoValid ? conN : null,
    // EA4: звук упражнения (трек) per-row. off → preset/loop обнуляются.
    ...buildExerciseAudioPayload(exercise),
  };
}
