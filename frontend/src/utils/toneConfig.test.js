// Unit-тесты pure-хелперов редактора «Стандартного тона» (CT4). Rule #37.
import {
  TONE_WAVE_TYPES,
  TONE_WAVE_LABELS,
  TONE_FREQ_MIN,
  TONE_FREQ_MAX,
  TONE_DURATION_MIN_MS,
  TONE_DURATION_MAX_MS,
  toneFormFromConfig,
  buildToneConfig,
} from './toneConfig';

describe('toneConfig — константы', () => {
  it('4 формы волны + лейбл на каждую', () => {
    expect(TONE_WAVE_TYPES).toEqual(['sine', 'square', 'triangle', 'sawtooth']);
    TONE_WAVE_TYPES.forEach((t) => expect(typeof TONE_WAVE_LABELS[t]).toBe('string'));
  });
});

describe('toneFormFromConfig', () => {
  const defaultCfg = { frequencies: [600, 900], durationMs: 80, type: 'sine', gain: 0.3 };

  it('tone_config задан → форма из него (первая частота)', () => {
    const form = toneFormFromConfig({ frequencies: [1234], durationMs: 150, type: 'square' }, defaultCfg);
    expect(form).toEqual({ frequency: 1234, durationMs: 150, type: 'square' });
  });

  it('tone_config null → форма из дефолта cue (первая частота многотона)', () => {
    expect(toneFormFromConfig(null, defaultCfg)).toEqual({ frequency: 600, durationMs: 80, type: 'sine' });
  });

  it('ни tone_config, ни defaultCfg → безопасный fallback 440/200/sine', () => {
    expect(toneFormFromConfig(null, null)).toEqual({ frequency: 440, durationMs: 200, type: 'sine' });
  });

  it('невалидный type в источнике → sine', () => {
    expect(toneFormFromConfig({ frequencies: [440], durationMs: 100, type: 'bogus' }, defaultCfg).type).toBe('sine');
  });

  it('пустой frequencies в tone_config → падает на defaultCfg', () => {
    expect(toneFormFromConfig({ frequencies: [], durationMs: 1, type: 'square' }, defaultCfg).frequency).toBe(600);
  });
});

describe('buildToneConfig', () => {
  it('валидная форма → single-frequency tone_config (round)', () => {
    expect(buildToneConfig({ frequency: 880.6, durationMs: 200.4, type: 'square' }))
      .toEqual({ frequencies: [881], durationMs: 200, type: 'square' });
  });

  it('clamp частоты в [20..20000]', () => {
    expect(buildToneConfig({ frequency: 5, durationMs: 100, type: 'sine' }).frequencies).toEqual([TONE_FREQ_MIN]);
    expect(buildToneConfig({ frequency: 99999, durationMs: 100, type: 'sine' }).frequencies).toEqual([TONE_FREQ_MAX]);
  });

  it('clamp длительности в [20..2000]', () => {
    expect(buildToneConfig({ frequency: 440, durationMs: 1, type: 'sine' }).durationMs).toBe(TONE_DURATION_MIN_MS);
    expect(buildToneConfig({ frequency: 440, durationMs: 99999, type: 'sine' }).durationMs).toBe(TONE_DURATION_MAX_MS);
  });

  it('NaN/пустой ввод (недоверенная форма) → дефолты, НЕ NaN (санитизация перед синтезом)', () => {
    const cfg = buildToneConfig({ frequency: '', durationMs: NaN, type: 'sine' });
    expect(cfg.frequencies[0]).toBe(440);
    expect(cfg.durationMs).toBe(200);
    expect(Number.isFinite(cfg.frequencies[0])).toBe(true);
    expect(Number.isFinite(cfg.durationMs)).toBe(true);
  });

  it('невалидная форма волны → sine', () => {
    expect(buildToneConfig({ frequency: 440, durationMs: 100, type: 'custom' }).type).toBe('sine');
  });

  it('строковый числовой ввод (из <input type=number>) коэрсится', () => {
    expect(buildToneConfig({ frequency: '880', durationMs: '250', type: 'triangle' }))
      .toEqual({ frequencies: [880], durationMs: 250, type: 'triangle' });
  });
});
