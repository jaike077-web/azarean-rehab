// =====================================================
// TESTS: AudioContext / AudioProvider (CP1)
// Mock Web Audio API — JSDOM не имеет AudioContext.
// Паттерн: jest.fn-конструктор + per-instance createOscillator/createGain
// чтобы можно было утверждать toHaveBeenCalledTimes (Rule #37).
// =====================================================

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  AudioProvider,
  useAudioCue,
  useAudioSettings,
  useAudioOverrides,
  getCueConfig,
} from './AudioContext';

// AudioProvider импортирует services/api (overrides, CA3/CA4). Реальный axios v1 —
// ESM, jest не трансформит node_modules → мокаем api (как везде в проекте).
jest.mock('../../../services/api', () => ({
  patientAuth: {
    listSounds: jest.fn(() => Promise.resolve({ data: [] })),
    // patient blob = ArrayBuffer(8) → decode тегирует буфер __src:'patient'
    fetchSoundBlob: jest.fn(() => Promise.resolve({
      data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) },
    })),
    // AA5: program-пресет blob = ArrayBuffer(16) → decode тегирует __src:'program'
    fetchProgramPresetBlob: jest.fn(() => Promise.resolve({
      data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) },
    })),
  },
}));
const { patientAuth } = require('../../../services/api');

// ---- Mock Web Audio API ----
const oscInstances = [];
const gainInstances = [];
// AA5: captured AudioBufferSourceNode'ы — буфер тегирован __src ('patient'|'program')
// чтобы доказать КАКОЙ ярус проиграл (различить приоритет, не только «буфер vs тон»).
const bufferSourceInstances = [];
// CA4: фейковый декодированный буфер + флаг «decode упал» (для fallback-теста).
const FAKE_AUDIO_BUFFER = { duration: 1, __fakeBuffer: true };
let mockDecodeShouldFail = false;

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
    createBufferSource: jest.fn(() => {
      const node = { buffer: null, connect: jest.fn(), start: jest.fn() };
      bufferSourceInstances.push(node);
      return node;
    }),
    // CA4/AA5: decodeAudioData (promise-форма). Управляемо через mockDecodeShouldFail.
    // Тегируем результат по byteLength входа: 16=program, иначе patient — чтобы тест
    // мог доказать, КАКОЙ ярус проиграл (node.buffer.__src).
    decodeAudioData: jest.fn((arr) => (
      mockDecodeShouldFail
        ? Promise.reject(new Error('decode fail'))
        : Promise.resolve({ ...FAKE_AUDIO_BUFFER, __src: arr && arr.byteLength === 16 ? 'program' : 'patient' })
    )),
    resume: jest.fn(),
    close: jest.fn(),
  };
}

let audioCtxCtor;

beforeEach(() => {
  oscInstances.length = 0;
  gainInstances.length = 0;
  bufferSourceInstances.length = 0;
  mockDecodeShouldFail = false;
  audioCtxCtor = jest.fn(() => createMockAudioContext());
  global.AudioContext = audioCtxCtor;
  delete global.webkitAudioContext;
  localStorage.clear();
  patientAuth.listSounds.mockResolvedValue({ data: [] });
  patientAuth.fetchSoundBlob.mockResolvedValue({
    data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) },
  });
  patientAuth.fetchProgramPresetBlob.mockResolvedValue({
    data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) },
  });
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

// =====================================================
// CA4 — cue-playback кастомного буфера (override → AudioBufferSourceNode)
// =====================================================
function CA4Consumer() {
  const { cue } = useAudioCue();
  const { refresh } = useAudioOverrides();
  return (
    <div>
      <button data-testid="ca4-refresh" type="button" onClick={() => refresh()}>refresh</button>
      <button data-testid="ca4-cue" type="button" onClick={() => cue('set_end')}>cue</button>
    </div>
  );
}

// Прокачать микротаски декода (fetch → arrayBuffer → decodeAudioData → buffersRef).
const flushDecode = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('CA4 — cue-playback кастомного буфера', () => {
  it('override декодирован → cue играет AudioBufferSourceNode, осциллятор НЕ вызван', async () => {
    patientAuth.listSounds.mockResolvedValue({ data: [{ cue_name: 'set_end', uploaded_at: 't1' }] });
    const { getByTestId } = render(<AudioProvider><CA4Consumer /></AudioProvider>);

    await act(async () => { fireEvent.click(getByTestId('ca4-refresh')); });
    await flushDecode();

    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);

    fireEvent.click(getByTestId('ca4-cue'));
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('нет override → cue падает на осциллятор (стандартный тон)', async () => {
    patientAuth.listSounds.mockResolvedValue({ data: [] });
    const { getByTestId } = render(<AudioProvider><CA4Consumer /></AudioProvider>);
    await act(async () => { fireEvent.click(getByTestId('ca4-refresh')); });
    await flushDecode();

    fireEvent.click(getByTestId('ca4-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).toHaveBeenCalled(); // set_end = двухтон
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
  });

  it('decode-fail → cue падает на осциллятор (не крэшит)', async () => {
    mockDecodeShouldFail = true;
    patientAuth.listSounds.mockResolvedValue({ data: [{ cue_name: 'set_end', uploaded_at: 't1' }] });
    const { getByTestId } = render(<AudioProvider><CA4Consumer /></AudioProvider>);
    await act(async () => { fireEvent.click(getByTestId('ca4-refresh')); });
    await flushDecode();

    fireEvent.click(getByTestId('ca4-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
  });
});

// =====================================================
// AA5 — program cue-resolution (2-ярусный буфер + приоритет §2.2)
// locked-program → patient → unlocked-program → стандартный тон
// =====================================================
function AA5Consumer() {
  const { cue, loadProgramCues } = useAudioCue();
  const { refresh } = useAudioOverrides();
  return (
    <div>
      <button data-testid="aa5-refresh" type="button" onClick={() => refresh()}>refresh</button>
      <button data-testid="aa5-cue" type="button" onClick={() => cue('set_end')}>cue</button>
      <button data-testid="aa5-locked-preset" type="button" onClick={() => loadProgramCues([{ cue_name: 'set_end', preset_id: 7, is_locked: true, sig: 's1' }])}>locked preset</button>
      <button data-testid="aa5-unlocked-preset" type="button" onClick={() => loadProgramCues([{ cue_name: 'set_end', preset_id: 7, is_locked: false, sig: 's1' }])}>unlocked preset</button>
      <button data-testid="aa5-unlocked-preset-s2" type="button" onClick={() => loadProgramCues([{ cue_name: 'set_end', preset_id: 9, is_locked: false, sig: 's2' }])}>unlocked preset s2</button>
      <button data-testid="aa5-locked-tone" type="button" onClick={() => loadProgramCues([{ cue_name: 'set_end', preset_id: null, is_locked: true, sig: 's1' }])}>locked tone</button>
      <button data-testid="aa5-clear" type="button" onClick={() => loadProgramCues(null)}>clear</button>
    </div>
  );
}

// Какой ярус реально проиграл (по тегу декодированного буфера); null = стандартный тон.
const playedSrc = () => {
  const n = bufferSourceInstances.find((x) => x.buffer && x.buffer.__src);
  return n ? n.buffer.__src : null;
};

describe('AA5 — program cue-resolution (приоритет §2.2)', () => {
  const renderAA5 = () => render(<AudioProvider><AA5Consumer /></AudioProvider>);
  const loadPatientOverride = async (getByTestId) => {
    patientAuth.listSounds.mockResolvedValue({ data: [{ cue_name: 'set_end', uploaded_at: 't1' }] });
    await act(async () => { fireEvent.click(getByTestId('aa5-refresh')); });
    await flushDecode();
  };

  it('locked-program пресет → играет PROGRAM-буфер (перебивает patient override)', async () => {
    const { getByTestId } = renderAA5();
    await loadPatientOverride(getByTestId);
    await act(async () => { fireEvent.click(getByTestId('aa5-locked-preset')); });
    await flushDecode();
    fireEvent.click(getByTestId('aa5-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(playedSrc()).toBe('program');
  });

  it('locked-program пресет, decode-fail программы → ТОН (patient НЕ перебивает lock)', async () => {
    const { getByTestId } = renderAA5();
    await loadPatientOverride(getByTestId);
    patientAuth.fetchProgramPresetBlob.mockRejectedValue(new Error('net'));
    await act(async () => { fireEvent.click(getByTestId('aa5-locked-preset')); });
    await flushDecode();
    fireEvent.click(getByTestId('aa5-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(playedSrc()).toBeNull();
  });

  it('locked-program «явный тон» (preset_id=null) → ТОН, patient НЕ перебивает', async () => {
    const { getByTestId } = renderAA5();
    await loadPatientOverride(getByTestId);
    await act(async () => { fireEvent.click(getByTestId('aa5-locked-tone')); });
    await flushDecode();
    fireEvent.click(getByTestId('aa5-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(playedSrc()).toBeNull();
  });

  it('unlocked-program + patient override → играет PATIENT (приоритет #2 > #3)', async () => {
    const { getByTestId } = renderAA5();
    await loadPatientOverride(getByTestId);
    await act(async () => { fireEvent.click(getByTestId('aa5-unlocked-preset')); });
    await flushDecode();
    fireEvent.click(getByTestId('aa5-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(playedSrc()).toBe('patient');
  });

  it('unlocked-program без patient → играет PROGRAM', async () => {
    const { getByTestId } = renderAA5();
    await act(async () => { fireEvent.click(getByTestId('aa5-unlocked-preset')); });
    await flushDecode();
    fireEvent.click(getByTestId('aa5-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(playedSrc()).toBe('program');
  });

  it('нет program, нет patient → стандартный ТОН (CP1 регресс-гард)', async () => {
    const { getByTestId } = renderAA5();
    fireEvent.click(getByTestId('aa5-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
  });

  it('смена sig пресета инвалидирует program-буфер → в окне ре-декода cue ТОН (не старый пресет)', async () => {
    const { getByTestId } = renderAA5();
    await act(async () => { fireEvent.click(getByTestId('aa5-unlocked-preset')); }); // preset 7, sig s1
    await flushDecode();                                                            // буфер s1 декодирован
    // Привязка сменилась на preset 9 / sig s2; подвешиваем fetch s2 (никогда не резолвится),
    // чтобы поймать ОКНО ре-декода: старый буфер должен быть инвалидирован → тон, не stale.
    patientAuth.fetchProgramPresetBlob.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => { fireEvent.click(getByTestId('aa5-unlocked-preset-s2')); });
    fireEvent.click(getByTestId('aa5-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    // sig-инвалидация удалила старый буфер preset 7 → играет тон, не stale пресет 7.
    expect(playedSrc()).toBeNull();
    expect(ctx.createOscillator).toHaveBeenCalled();
  });

  it('loadProgramCues(null) сбрасывает program-ярус → cue ТОН', async () => {
    const { getByTestId } = renderAA5();
    await act(async () => { fireEvent.click(getByTestId('aa5-unlocked-preset')); });
    await flushDecode();
    await act(async () => { fireEvent.click(getByTestId('aa5-clear')); });
    fireEvent.click(getByTestId('aa5-cue'));
    const ctx = audioCtxCtor.mock.results[0].value;
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(playedSrc()).toBeNull();
  });
});
