// Unit-тесты pure-хелпера validateToneConfig (CT2 — редактор «Стандартного тона»).
// Rule #37: named pure function, тестируется без HTTP/БД.
const {
  TONE_WAVE_TYPES,
  validateToneConfig,
} = require('../../utils/audioTone');

describe('validateToneConfig', () => {
  it('валидный конфиг → ok + нормализованное value (round, 3 ключа)', () => {
    const r = validateToneConfig({ frequencies: [880.7], durationMs: 200.4, type: 'square' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ frequencies: [881], durationMs: 200, type: 'square' });
    // ровно 3 ключа — лишнее не протекает в БД
    expect(Object.keys(r.value).sort()).toEqual(['durationMs', 'frequencies', 'type']);
  });

  it('лишние ключи (gain и пр.) отбрасываются при нормализации', () => {
    const r = validateToneConfig({ frequencies: [440], durationMs: 100, type: 'sine', gain: 9, evil: ';' });
    expect(r.ok).toBe(true);
    expect(r.value.gain).toBeUndefined();
    expect(r.value.evil).toBeUndefined();
  });

  it('многотоновый массив сохраняется (1..8)', () => {
    const r = validateToneConfig({ frequencies: [660, 990], durationMs: 250, type: 'triangle' });
    expect(r.ok).toBe(true);
    expect(r.value.frequencies).toEqual([660, 990]);
  });

  it('все 4 формы волны валидны', () => {
    TONE_WAVE_TYPES.forEach((type) => {
      expect(validateToneConfig({ frequencies: [440], durationMs: 100, type }).ok).toBe(true);
    });
  });

  it.each([
    ['не объект (строка)', 'x'],
    ['не объект (массив)', [1, 2]],
    ['null', null],
    ['frequencies не массив', { frequencies: 440, durationMs: 100, type: 'sine' }],
    ['frequencies пустой', { frequencies: [], durationMs: 100, type: 'sine' }],
    ['frequencies > 8', { frequencies: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => n * 100), durationMs: 100, type: 'sine' }],
    ['частота < 20', { frequencies: [10], durationMs: 100, type: 'sine' }],
    ['частота > 20000', { frequencies: [25000], durationMs: 100, type: 'sine' }],
    ['частота NaN', { frequencies: ['abc'], durationMs: 100, type: 'sine' }],
    ['durationMs < 20', { frequencies: [440], durationMs: 5, type: 'sine' }],
    ['durationMs > 2000', { frequencies: [440], durationMs: 5000, type: 'sine' }],
    ['durationMs NaN', { frequencies: [440], durationMs: 'x', type: 'sine' }],
    ['форма волны не из списка', { frequencies: [440], durationMs: 100, type: 'custom' }],
    ['форма волны отсутствует', { frequencies: [440], durationMs: 100 }],
  ])('невалидно: %s → ok:false + error', (_label, input) => {
    const r = validateToneConfig(input);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.error.length).toBeGreaterThan(0);
  });

  it('граничные значения (20/20000 Гц, 20/2000 мс) валидны', () => {
    expect(validateToneConfig({ frequencies: [20, 20000], durationMs: 20, type: 'sine' }).ok).toBe(true);
    expect(validateToneConfig({ frequencies: [440], durationMs: 2000, type: 'sine' }).ok).toBe(true);
  });
});
