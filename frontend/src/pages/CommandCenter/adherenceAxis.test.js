// =====================================================
// TEST: adherenceAxis — named pure helper (ARC-CYCLE AC7, Rule #37)
// Тестируется функцией, без рендера (CSS Modules / JSDOM не нужны).
// =====================================================

import { ADHERENCE_AXES, adherenceAxisValue } from './adherenceAxis';

describe('ADHERENCE_AXES', () => {
  test('две оси раздельно: gymnastics + training (Rule #34)', () => {
    expect(ADHERENCE_AXES.map((a) => a.key)).toEqual(['gymnastics', 'training']);
    expect(ADHERENCE_AXES.map((a) => a.label)).toEqual(['Гимнастика', 'Тренировка']);
  });
});

describe('adherenceAxisValue', () => {
  test('есть цели → "A из W" (W = onboarded − no_target)', () => {
    const r = adherenceAxisValue({ adhering: 2, no_target: 1 }, 5);
    expect(r.withTarget).toBe(4);
    expect(r.adhering).toBe(2);
    expect(r.text).toBe('2 из 4');
  });

  test('ось полностью no_target → «—» (не «0 из 0»)', () => {
    const r = adherenceAxisValue({ adhering: 0, no_target: 5 }, 5);
    expect(r.withTarget).toBe(0);
    expect(r.text).toBe('—');
  });

  test('все с целью, никто не соблюдает → "0 из W" (не «—»)', () => {
    const r = adherenceAxisValue({ adhering: 0, no_target: 0 }, 4);
    expect(r.text).toBe('0 из 4');
  });

  test('ось отсутствует/undefined → дефолт 0/0 (бэкенд всегда шлёт обе оси), без throw', () => {
    // adhering 0, no_target 0 → withTarget = onboarded → "0 из 5". «—» сигналит
    // именно «нет целей» (no_target == onboarded), а не отсутствие объекта оси.
    expect(adherenceAxisValue(undefined, 5).text).toBe('0 из 5');
    expect(adherenceAxisValue(null, 5).text).toBe('0 из 5');
    expect(adherenceAxisValue({}, 5).text).toBe('0 из 5');
  });

  test('onboarded 0 / отсутствует → «—» (нет деления, guard)', () => {
    expect(adherenceAxisValue({ adhering: 0, no_target: 0 }, 0).text).toBe('—');
    expect(adherenceAxisValue({ adhering: 0, no_target: 0 }, undefined).text).toBe('—');
  });

  test('no_target > onboarded (рассинхрон) → withTarget клампится в 0', () => {
    const r = adherenceAxisValue({ adhering: 0, no_target: 9 }, 5);
    expect(r.withTarget).toBe(0);
    expect(r.text).toBe('—');
  });
});
