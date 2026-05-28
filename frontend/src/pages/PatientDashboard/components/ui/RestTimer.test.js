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
