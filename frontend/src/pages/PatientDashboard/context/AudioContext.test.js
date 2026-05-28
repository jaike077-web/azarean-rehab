// =====================================================
// TESTS: AudioContext / AudioProvider (CP1)
// Mock Web Audio API — JSDOM не имеет AudioContext.
// Паттерн: jest.fn-конструктор + per-instance createOscillator/createGain
// чтобы можно было утверждать toHaveBeenCalledTimes (Rule #37).
// =====================================================

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  AudioProvider,
  useAudioCue,
  useAudioSettings,
  getCueConfig,
} from './AudioContext';

// ---- Mock Web Audio API ----
const oscInstances = [];
const gainInstances = [];

function createMockAudioContext() {
  return {
    state: 'running',
    currentTime: 0,
    destination: { __mock: 'destination' },
    createOscillator: jest.fn(() => {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      };
      oscInstances.push(osc);
      return osc;
    }),
    createGain: jest.fn(() => {
      const gain = {
        gain: { value: 0 },
        connect: jest.fn(),
      };
      gainInstances.push(gain);
      return gain;
    }),
    createBuffer: jest.fn(() => ({})),
    createBufferSource: jest.fn(() => ({
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
    })),
    resume: jest.fn(),
    close: jest.fn(),
  };
}

let audioCtxCtor;

beforeEach(() => {
  oscInstances.length = 0;
  gainInstances.length = 0;
  audioCtxCtor = jest.fn(() => createMockAudioContext());
  global.AudioContext = audioCtxCtor;
  delete global.webkitAudioContext;
  localStorage.clear();
});

afterEach(() => {
  delete global.AudioContext;
});

// ---- Тестовый consumer ----
function Consumer() {
  const { cue, prime } = useAudioCue();
  const { settings, setSettings } = useAudioSettings();
  return (
    <div>
      <button data-testid="cue-rest" type="button" onClick={() => cue('rest_end')}>
        cue rest
      </button>
      <button data-testid="cue-set" type="button" onClick={() => cue('set_end')}>
        cue set
      </button>
      <button data-testid="cue-unknown" type="button" onClick={() => cue('not_a_cue')}>
        cue unknown
      </button>
      <button data-testid="prime" type="button" onClick={prime}>
        prime
      </button>
      <button data-testid="off" type="button" onClick={() => setSettings({ enabled: false })}>
        off
      </button>
      <button data-testid="vol50" type="button" onClick={() => setSettings({ volume: 0.5 })}>
        vol50
      </button>
      <button data-testid="vol-clip" type="button" onClick={() => setSettings({ volume: 1.7 })}>
        vol overflow
      </button>
      <span data-testid="enabled">{String(settings.enabled)}</span>
      <span data-testid="volume">{settings.volume}</span>
    </div>
  );
}

const renderProvider = () =>
  render(
    <AudioProvider>
      <Consumer />
    </AudioProvider>,
  );

// =====================================================
// getCueConfig — pure cue catalogue (Rule #37)
// =====================================================
describe('getCueConfig — pure cue catalogue', () => {
  it('rest_end — 880 Hz / 300 ms / gain 0.3 (1:1 с legacy RestTimer.playBeep)', () => {
    expect(getCueConfig('rest_end')).toEqual({
      frequencies: [880],
      gain: 0.3,
      durationMs: 300,
      type: 'sine',
    });
  });

  it('count_tick — короткий блип 600 Hz / 80 ms', () => {
    expect(getCueConfig('count_tick')).toEqual({
      frequencies: [600],
      gain: 0.3,
      durationMs: 80,
      type: 'sine',
    });
  });

  it('set_end — двухтон 660→990 Hz', () => {
    const cfg = getCueConfig('set_end');
    expect(cfg.frequencies).toEqual([660, 990]);
    expect(cfg.durationMs).toBe(250);
    expect(cfg.type).toBe('sine');
  });

  it('set_start (CP3c.1) — восходящий двухтон 880→1320 Hz / 200 ms', () => {
    const cfg = getCueConfig('set_start');
    expect(cfg.frequencies).toEqual([880, 1320]);
    expect(cfg.durationMs).toBe(200);
    expect(cfg.gain).toBe(0.3);
    expect(cfg.type).toBe('sine');
  });

  it('tempo_tick — зарезервировано (CP3b), мягкий клик', () => {
    expect(getCueConfig('tempo_tick')).toEqual({
      frequencies: [1000],
      gain: 0.15,
      durationMs: 40,
      type: 'sine',
    });
  });

  it('unknown cue → null (не падает)', () => {
    expect(getCueConfig('foo')).toBeNull();
  });
});

// =====================================================
// cue() — gating через settings.enabled
// =====================================================
describe('cue() — gating через settings.enabled', () => {
  it('enabled:true + rest_end → createOscillator вызван РОВНО 1 раз', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('cue-rest'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(oscInstances[0].frequency.value).toBe(880);
  });

  it('enabled:false → cue() — no-op, AudioContext не создаётся вообще', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('off'));
    fireEvent.click(getByTestId('cue-rest'));
    // Контекст ленивый, до первой реальной игры не создаётся
    expect(audioCtxCtor).toHaveBeenCalledTimes(0);
  });

  it('set_end (двухтон) → 2 осциллятора', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('cue-set'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('cue с неизвестным именем → no-op, без создания контекста', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('cue-unknown'));
    expect(audioCtxCtor).toHaveBeenCalledTimes(0);
  });
});

// =====================================================
// prime() — идемпотентен
// =====================================================
describe('prime() — идемпотентен', () => {
  it('два вызова prime() → один AudioContext создан', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('prime'));
    fireEvent.click(getByTestId('prime'));
    expect(audioCtxCtor).toHaveBeenCalledTimes(1);
  });

  it('prime затем cue — переиспользует тот же контекст', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('prime'));
    fireEvent.click(getByTestId('cue-rest'));
    expect(audioCtxCtor).toHaveBeenCalledTimes(1);
    // createBufferSource из prime + createOscillator из cue — оба вызваны
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
  });

  it('prime резюмит контекст (resume называется)', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('prime'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.resume).toHaveBeenCalled();
  });
});

// =====================================================
// settings — localStorage persist
// =====================================================
describe('settings — localStorage persist', () => {
  it('default settings = { enabled:true, volume:0.6 }', () => {
    const { getByTestId } = renderProvider();
    expect(getByTestId('enabled').textContent).toBe('true');
    expect(getByTestId('volume').textContent).toBe('0.6');
  });

  it('setSettings({enabled:false}) → пишет localStorage["azarean_audio"]', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('off'));
    const stored = JSON.parse(localStorage.getItem('azarean_audio'));
    expect(stored.enabled).toBe(false);
    expect(stored.volume).toBe(0.6);
  });

  it('читает существующий localStorage при mount', () => {
    localStorage.setItem(
      'azarean_audio',
      JSON.stringify({ enabled: false, volume: 0.3 }),
    );
    const { getByTestId } = renderProvider();
    expect(getByTestId('enabled').textContent).toBe('false');
    expect(getByTestId('volume').textContent).toBe('0.3');
  });

  it('повреждённый JSON → fallback на defaults', () => {
    localStorage.setItem('azarean_audio', '{not-json}');
    const { getByTestId } = renderProvider();
    expect(getByTestId('enabled').textContent).toBe('true');
    expect(getByTestId('volume').textContent).toBe('0.6');
  });

  it('volume > 1 → клампится в [0..1]', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('vol-clip'));
    expect(getByTestId('volume').textContent).toBe('1');
  });
});

// =====================================================
// volume × cfg.gain — peak gain applied
// =====================================================
describe('peak gain = settings.volume × cfg.gain', () => {
  it('volume=1 + rest_end.gain=0.3 → gain.value ≈ 0.3', () => {
    localStorage.setItem(
      'azarean_audio',
      JSON.stringify({ enabled: true, volume: 1 }),
    );
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('cue-rest'));
    expect(gainInstances[0].gain.value).toBeCloseTo(0.3);
  });

  it('volume=0.5 + rest_end.gain=0.3 → gain.value ≈ 0.15', () => {
    const { getByTestId } = renderProvider();
    fireEvent.click(getByTestId('vol50'));
    fireEvent.click(getByTestId('cue-rest'));
    expect(gainInstances[0].gain.value).toBeCloseTo(0.15);
  });
});
