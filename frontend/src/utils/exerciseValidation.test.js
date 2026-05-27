// =====================================================
// TESTS: exerciseValidation helpers (CP2b)
//
// Rule #37 — pure helpers тестируются отдельно от UI.
// validateExerciseRow — зеркало chk_ce_has_prescription + chk_ce_tempo.
// normalizeExerciseForPayload — payload-shape для POST/PUT /complexes.
// =====================================================

import {
  toPositiveInt,
  toNonNegativeInt,
  validateExerciseRow,
  normalizeExerciseForPayload,
  TEMPO_BOUNDS,
} from './exerciseValidation';

// =====================================================
// toPositiveInt / toNonNegativeInt
// =====================================================
describe('toPositiveInt', () => {
  it.each([
    ['10', 10],
    [10, 10],
    ['10.7', 10],
    [10.7, 10],
  ])('positive number "%s" → %s', (input, expected) => {
    expect(toPositiveInt(input)).toBe(expected);
  });

  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    [0, null],
    ['0', null],
    [-5, null],
    ['-5', null],
    ['abc', null],
    [NaN, null],
  ])('non-positive / invalid "%s" → null', (input, expected) => {
    expect(toPositiveInt(input)).toBe(expected);
  });
});

describe('toNonNegativeInt', () => {
  it('0 → 0 (для tempo_pause_s)', () => {
    expect(toNonNegativeInt(0)).toBe(0);
    expect(toNonNegativeInt('0')).toBe(0);
  });

  it('negative → null', () => {
    expect(toNonNegativeInt(-1)).toBeNull();
  });

  it('empty/null → null', () => {
    expect(toNonNegativeInt('')).toBeNull();
    expect(toNonNegativeInt(null)).toBeNull();
  });
});

// =====================================================
// validateExerciseRow — chk_ce_has_prescription зеркало
// =====================================================
describe('validateExerciseRow — prescription guard', () => {
  it('reps=10 only → no errors', () => {
    expect(validateExerciseRow({ reps: 10 })).toEqual({});
  });

  it('duration_seconds=30 only → no errors (time-only OK после CP2b)', () => {
    expect(validateExerciseRow({ duration_seconds: 30 })).toEqual({});
  });

  it('reps=10 + duration=30 (XOR снят) → no errors', () => {
    expect(validateExerciseRow({ reps: 10, duration_seconds: 30 })).toEqual({});
  });

  it('обе пустые → prescription error (зеркало chk_ce_has_prescription)', () => {
    const errors = validateExerciseRow({ reps: '', duration_seconds: '' });
    expect(errors.prescription).toMatch(/повторы или время/i);
  });

  it('reps=0 + duration=0 → prescription error (CP2b отказ от legacy reps:0)', () => {
    const errors = validateExerciseRow({ reps: 0, duration_seconds: 0 });
    expect(errors.prescription).toBeDefined();
  });

  it('reps=undefined + duration=undefined → prescription error', () => {
    const errors = validateExerciseRow({});
    expect(errors.prescription).toBeDefined();
  });
});

// =====================================================
// validateExerciseRow — chk_ce_tempo зеркало
// =====================================================
describe('validateExerciseRow — tempo all-or-nothing', () => {
  it('темп не задан (все пустые) → no errors', () => {
    expect(validateExerciseRow({
      reps: 10,
      tempo_eccentric_s: '',
      tempo_pause_s: '',
      tempo_concentric_s: '',
    })).toEqual({});
  });

  it('темп 3-0-3 (valid) → no errors', () => {
    expect(validateExerciseRow({
      reps: 10,
      tempo_eccentric_s: 3,
      tempo_pause_s: 0,
      tempo_concentric_s: 3,
    })).toEqual({});
  });

  it('темп частичный (ecc только) → tempo error', () => {
    const errors = validateExerciseRow({
      reps: 10,
      tempo_eccentric_s: 3,
      tempo_pause_s: '',
      tempo_concentric_s: '',
    });
    expect(errors.tempo).toMatch(/три темп-поля|очистите/i);
  });

  it('темп ecc=0 (< ECC_MIN) → tempo error', () => {
    const errors = validateExerciseRow({
      reps: 10,
      tempo_eccentric_s: 0,
      tempo_pause_s: 0,
      tempo_concentric_s: 3,
    });
    expect(errors.tempo).toBeDefined();
  });

  it('темп ecc=31 (> ECC_MAX) → tempo error', () => {
    const errors = validateExerciseRow({
      reps: 10,
      tempo_eccentric_s: 31,
      tempo_pause_s: 0,
      tempo_concentric_s: 3,
    });
    expect(errors.tempo).toBeDefined();
  });

  it('темп pause=0 (boundary >= 0) → OK', () => {
    expect(validateExerciseRow({
      reps: 10,
      tempo_eccentric_s: 2,
      tempo_pause_s: 0,
      tempo_concentric_s: 2,
    })).toEqual({});
  });

  it('границы из TEMPO_BOUNDS совпадают с миграцией 20260527', () => {
    expect(TEMPO_BOUNDS).toEqual({
      ECC_MIN: 1, ECC_MAX: 30,
      PAUSE_MIN: 0, PAUSE_MAX: 30,
      CON_MIN: 1, CON_MAX: 30,
    });
  });
});

// =====================================================
// normalizeExerciseForPayload — POST/PUT shape
// =====================================================
describe('normalizeExerciseForPayload — payload shape', () => {
  it('reps-only → reps=10, duration=null, auto_complete=true', () => {
    const payload = normalizeExerciseForPayload(
      { id: 5, sets: 3, reps: 10, duration_seconds: '' },
      1,
    );
    expect(payload).toMatchObject({
      exercise_id: 5,
      order_number: 1,
      sets: 3,
      reps: 10,
      duration_seconds: null,
      auto_complete: true,
    });
  });

  it('time-only → reps=null (НЕ 0!), duration=30', () => {
    const payload = normalizeExerciseForPayload(
      { id: 5, sets: 3, reps: '', duration_seconds: 30 },
      1,
    );
    expect(payload.reps).toBeNull();
    expect(payload.duration_seconds).toBe(30);
  });

  it('reps=0 (legacy CreateComplex.js payload) → reps=null (чистый payload)', () => {
    const payload = normalizeExerciseForPayload(
      { id: 5, sets: 3, reps: 0, duration_seconds: 30 },
      1,
    );
    expect(payload.reps).toBeNull();
  });

  it('reps + duration сосуществуют → оба в payload', () => {
    const payload = normalizeExerciseForPayload(
      { id: 5, sets: 3, reps: 10, duration_seconds: 30 },
      1,
    );
    expect(payload.reps).toBe(10);
    expect(payload.duration_seconds).toBe(30);
  });

  it('auto_complete=false → false в payload', () => {
    const payload = normalizeExerciseForPayload(
      { id: 5, sets: 3, duration_seconds: 30, auto_complete: false },
      1,
    );
    expect(payload.auto_complete).toBe(false);
  });

  it('auto_complete отсутствует → true (DEFAULT в БД)', () => {
    const payload = normalizeExerciseForPayload(
      { id: 5, sets: 3, reps: 10 },
      1,
    );
    expect(payload.auto_complete).toBe(true);
  });

  it('темп 3-0-3 валиден → [3, 0, 3] в payload', () => {
    const payload = normalizeExerciseForPayload(
      {
        id: 5, sets: 3, reps: 10,
        tempo_eccentric_s: 3, tempo_pause_s: 0, tempo_concentric_s: 3,
      },
      1,
    );
    expect(payload.tempo_eccentric_s).toBe(3);
    expect(payload.tempo_pause_s).toBe(0);
    expect(payload.tempo_concentric_s).toBe(3);
  });

  it('темп частичный → ВСЕ tempo в payload null (all-or-nothing safety)', () => {
    const payload = normalizeExerciseForPayload(
      {
        id: 5, sets: 3, reps: 10,
        tempo_eccentric_s: 3, tempo_pause_s: '', tempo_concentric_s: '',
      },
      1,
    );
    expect(payload.tempo_eccentric_s).toBeNull();
    expect(payload.tempo_pause_s).toBeNull();
    expect(payload.tempo_concentric_s).toBeNull();
  });

  it('темп за пределами границ → ВСЕ tempo null', () => {
    const payload = normalizeExerciseForPayload(
      {
        id: 5, sets: 3, reps: 10,
        tempo_eccentric_s: 31, tempo_pause_s: 0, tempo_concentric_s: 3,
      },
      1,
    );
    expect(payload.tempo_eccentric_s).toBeNull();
    expect(payload.tempo_pause_s).toBeNull();
    expect(payload.tempo_concentric_s).toBeNull();
  });

  it('exercise_id источник — exercise.id ИЛИ exercise.exercise_id', () => {
    expect(normalizeExerciseForPayload({ id: 7, reps: 10 }, 1).exercise_id).toBe(7);
    expect(normalizeExerciseForPayload({ exercise_id: 8, reps: 10 }, 1).exercise_id).toBe(8);
  });

  it('order_number из аргумента, не из exercise', () => {
    const payload = normalizeExerciseForPayload({ id: 5, reps: 10, order_number: 99 }, 3);
    expect(payload.order_number).toBe(3);
  });

  it('rest_seconds default 30 если пустой', () => {
    const payload = normalizeExerciseForPayload({ id: 5, reps: 10 }, 1);
    expect(payload.rest_seconds).toBe(30);
  });

  it('rest_seconds=0 → 0 (паттерн «без отдыха», валидный)', () => {
    const payload = normalizeExerciseForPayload({ id: 5, reps: 10, rest_seconds: 0 }, 1);
    expect(payload.rest_seconds).toBe(0);
  });

  it('sets default 3', () => {
    const payload = normalizeExerciseForPayload({ id: 5, reps: 10 }, 1);
    expect(payload.sets).toBe(3);
  });
});
