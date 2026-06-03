// =====================================================
// TESTS: useAudioPreview — прослушка пресета + генерационный токен
// (защита от гонки двойного клика / воспроизведения после размонтирования).
// =====================================================

import { renderHook, act } from '@testing-library/react';
import useAudioPreview from './useAudioPreview';
import { admin } from '../services/api';

jest.mock('../services/api', () => ({ admin: { fetchAudioPresetBlob: jest.fn() } }));
jest.mock('../context/ToastContext', () => ({ useToast: () => ({ error: jest.fn() }) }));
jest.mock('../pages/PatientDashboard/context/AudioContext', () => ({
  getCueConfig: (name) => (name === 'count_tick'
    ? { frequencies: [600], gain: 0.3, durationMs: 80, type: 'sine' }
    : null),
}));

let playMock;
let oscCount;

beforeEach(() => {
  jest.clearAllMocks();
  playMock = jest.fn().mockResolvedValue(undefined);
  oscCount = 0;
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
  global.Audio = jest.fn().mockImplementation(() => ({
    play: playMock, pause: jest.fn(), src: '', onended: null, onerror: null,
  }));
  global.AudioContext = jest.fn().mockImplementation(() => ({
    state: 'running', currentTime: 0, resume: jest.fn(), close: jest.fn(), destination: {},
    createOscillator: () => { oscCount += 1; return { type: '', frequency: { value: 0 }, connect: jest.fn(), start: jest.fn(), stop: jest.fn() }; },
    createGain: () => ({ gain: { value: 0 }, connect: jest.fn() }),
  }));
});

describe('useAudioPreview', () => {
  it('presetId=null — no-op (нет файла для прослушки)', async () => {
    const { result } = renderHook(() => useAudioPreview());
    await act(async () => { await result.current(null); });
    expect(admin.fetchAudioPresetBlob).not.toHaveBeenCalled();
    expect(playMock).not.toHaveBeenCalled();
  });

  it('один вызов — грузит blob по id и играет', async () => {
    admin.fetchAudioPresetBlob.mockResolvedValue({ data: new Blob(['x']) });
    const { result } = renderHook(() => useAudioPreview());
    await act(async () => { await result.current(5); });
    expect(admin.fetchAudioPresetBlob).toHaveBeenCalledWith(5);
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('гонка двойного клика: устаревший in-flight вызов не играет (ген-токен)', async () => {
    let resolveA;
    admin.fetchAudioPresetBlob
      .mockImplementationOnce(() => new Promise((r) => { resolveA = r; })) // A зависает в полёте
      .mockResolvedValueOnce({ data: new Blob(['b']) });                   // B резолвится сразу
    const { result } = renderHook(() => useAudioPreview());
    await act(async () => {
      const pA = result.current(1); // A — pending
      const pB = result.current(2); // B — бампит ген, резолвится, играет
      await pB;
      resolveA({ data: new Blob(['a']) }); // A резолвится, но ген сместился → bail
      await pA;
    });
    expect(admin.fetchAudioPresetBlob).toHaveBeenCalledTimes(2);
    expect(playMock).toHaveBeenCalledTimes(1); // играл только B, A не наложился
  });

  it('presetId=null + cueName — синтезирует стандартный тон события (не грузит файл)', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAudioPreview());
    await act(async () => { await result.current(null, 'count_tick'); });
    expect(global.AudioContext).toHaveBeenCalledTimes(1);
    expect(oscCount).toBe(1); // count_tick = одна частота
    expect(admin.fetchAudioPresetBlob).not.toHaveBeenCalled();
    act(() => { jest.runOnlyPendingTimers(); }); // закрытие ctx по setTimeout
    jest.useRealTimers();
  });

  it('CT4: toneConfigOverride перебивает дефолт (▶ играет редактируемый тон)', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAudioPreview());
    // override с ДВУМЯ частотами vs count_tick дефолт (одна) → override применён.
    await act(async () => {
      await result.current(null, 'count_tick', { frequencies: [440, 550], durationMs: 100, type: 'square' });
    });
    expect(global.AudioContext).toHaveBeenCalledTimes(1);
    expect(oscCount).toBe(2);
    expect(admin.fetchAudioPresetBlob).not.toHaveBeenCalled();
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
  });
});
