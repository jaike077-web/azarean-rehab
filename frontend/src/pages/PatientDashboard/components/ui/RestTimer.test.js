// =====================================================
// TESTS: RestTimer — CP1 audio consumer (anti-regression)
//
// Шаг 2 TZ_CP1: убедиться что после рефактора (локальный playBeep →
// cue('rest_end') из AudioProvider) поведение сохранено 1:1:
//   - при достижении 0 createOscillator вызывается ровно 1 раз
//   - тон = 880 Hz (legacy)
//   - при azarean_audio.enabled=false осциллятор НЕ создаётся
// =====================================================

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import RestTimer from './RestTimer';
import { AudioProvider } from '../../context/AudioContext';

// AudioProvider импортирует services/api (overrides, CA3) → реальный axios v1
// (ESM) не парсится jest'ом в node_modules. Мокаем api (inert тут).
jest.mock('../../../../services/api', () => ({
  patientAuth: { listSounds: jest.fn(() => Promise.resolve({ data: [] })) },
}));

// Mock Web Audio API — JSDOM не имеет AudioContext.
let mockCtxCtor;
let lastMockCtx;

const createMockAudioContext = () => {
  lastMockCtx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createOscillator: jest.fn(() => ({
      type: 'sine',
      frequency: { value: 0 },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    })),
    createGain: jest.fn(() => ({
      gain: { value: 0 },
      connect: jest.fn(),
    })),
    createBuffer: jest.fn(() => ({})),
    createBufferSource: jest.fn(() => ({
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
    })),
    resume: jest.fn(),
    close: jest.fn(),
  };
  return lastMockCtx;
};

beforeEach(() => {
  jest.useFakeTimers();
  mockCtxCtor = jest.fn(() => createMockAudioContext());
  global.AudioContext = mockCtxCtor;
  delete global.webkitAudioContext;
  localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  delete global.AudioContext;
});

const renderTimer = (props = {}) =>
  render(
    <AudioProvider>
      <RestTimer defaultSeconds={3} {...props} />
    </AudioProvider>,
  );

describe('RestTimer — CP1 audio consumer', () => {
  it('при истечении countdown createOscillator вызывается РОВНО 1 раз (anti-regression)', () => {
    const { getByLabelText } = renderTimer();
    fireEvent.click(getByLabelText('Старт'));
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    expect(lastMockCtx.createOscillator).toHaveBeenCalledTimes(1);
  });

  it('тон = 880 Hz (1:1 как было в legacy RestTimer.playBeep)', () => {
    const { getByLabelText } = renderTimer();
    fireEvent.click(getByLabelText('Старт'));
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    const oscInstance = lastMockCtx.createOscillator.mock.results[0].value;
    expect(oscInstance.frequency.value).toBe(880);
  });

  it('при azarean_audio.enabled=false осциллятор НЕ создаётся', () => {
    localStorage.setItem(
      'azarean_audio',
      JSON.stringify({ enabled: false, volume: 0.6 }),
    );
    const { getByLabelText } = renderTimer();
    fireEvent.click(getByLabelText('Старт'));
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    // AudioContext не создан вообще — cue вышел на gate перед ensureContext
    expect(mockCtxCtor).toHaveBeenCalledTimes(0);
  });

  it('onComplete всё равно вызывается (звук — вспомогательный канал)', () => {
    const onComplete = jest.fn();
    const { getByLabelText } = renderTimer({ onComplete });
    fireEvent.click(getByLabelText('Старт'));
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('mount без user-gesture не падает (AudioContext lazy)', () => {
    expect(() => renderTimer()).not.toThrow();
    // До первого срабатывания таймера AudioContext не создаётся
    expect(mockCtxCtor).toHaveBeenCalledTimes(0);
  });
});

describe('RestTimer — DA2 presets prop + ring size', () => {
  it('hidePresets=true: presets контейнер скрыт', () => {
    const { container } = renderTimer({ hidePresets: true });
    expect(container.querySelector('.pd-rest-timer-presets')).toBeNull();
  });

  it('hidePresets=false (default): presets контейнер виден', () => {
    const { container } = renderTimer();
    expect(container.querySelector('.pd-rest-timer-presets')).not.toBeNull();
  });

  it('SVG ring size = 170 (DA2: консистентность с PhaseRing)', () => {
    const { container } = renderTimer();
    const svg = container.querySelector('.pd-rest-timer-ring svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('width')).toBe('170');
    expect(svg.getAttribute('height')).toBe('170');
  });
});

// =====================================================
// WARN — pre-end count_tick (2026-05-29)
//
// cue('count_tick') когда отдых ДОСТИГАЕТ 10 и 5 секунд. count_tick = 600 Hz
// (1 осциллятор), rest_end = 880 Hz (1 осциллятор). Проверяем последовательность
// частот в порядке создания осцилляторов: [тик10, тик5, rest_end] = [600,600,880].
// Один общий AudioContext (lazy, кэшируется в ctxRef) → все осцилляторы на
// lastMockCtx.createOscillator. Покрывает авто per-set rest и ручной preset
// (один и тот же компонент/эффект).
// =====================================================
describe('RestTimer — WARN pre-end count_tick', () => {
  const oscFreqs = () =>
    lastMockCtx.createOscillator.mock.results.map((r) => r.value.frequency.value);

  it('rest 12с: тик 10 + тик 5 + rest_end → осцилляторы [600, 600, 880]', () => {
    const { getByLabelText } = renderTimer({ defaultSeconds: 12 });
    fireEvent.click(getByLabelText('Старт'));
    act(() => {
      jest.advanceTimersByTime(12500);
    });
    expect(oscFreqs()).toEqual([600, 600, 880]);
  });

  it('rest 7с: только тик 5 + rest_end → [600, 880] (10-бип НЕ звучит)', () => {
    const { getByLabelText } = renderTimer({ defaultSeconds: 7 });
    fireEvent.click(getByLabelText('Старт'));
    act(() => {
      jest.advanceTimersByTime(7500);
    });
    expect(oscFreqs()).toEqual([600, 880]);
  });

  it('rest 4с: 0 warning-бипов, только rest_end → [880]', () => {
    const { getByLabelText } = renderTimer({ defaultSeconds: 4 });
    fireEvent.click(getByLabelText('Старт'));
    act(() => {
      jest.advanceTimersByTime(4500);
    });
    expect(oscFreqs()).toEqual([880]);
  });

  it('autoStart per-set rest 12с: тик 10 + тик 5 + rest_end (без ручного Старт)', () => {
    render(
      <AudioProvider>
        <RestTimer autoStart defaultSeconds={12} onComplete={jest.fn()} />
      </AudioProvider>,
    );
    act(() => {
      jest.advanceTimersByTime(12500);
    });
    expect(oscFreqs()).toEqual([600, 600, 880]);
  });

  it('звук выключен: WARN-бипы не звучат (AudioContext не создаётся вообще)', () => {
    localStorage.setItem(
      'azarean_audio',
      JSON.stringify({ enabled: false, volume: 0.6 }),
    );
    const { getByLabelText } = renderTimer({ defaultSeconds: 12 });
    fireEvent.click(getByLabelText('Старт'));
    act(() => {
      jest.advanceTimersByTime(12500);
    });
    expect(mockCtxCtor).toHaveBeenCalledTimes(0);
  });
});
