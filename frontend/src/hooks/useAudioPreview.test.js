// =====================================================
// TESTS: useAudioPreview — прослушка пресета + генерационный токен
// (защита от гонки двойного клика / воспроизведения после размонтирования).
// =====================================================

import { renderHook, act } from '@testing-library/react';
import useAudioPreview from './useAudioPreview';
import { admin } from '../services/api';

jest.mock('../services/api', () => ({ admin: { fetchAudioPresetBlob: jest.fn() } }));
jest.mock('../context/ToastContext', () => ({ useToast: () => ({ error: jest.fn() }) }));

let playMock;

beforeEach(() => {
  jest.clearAllMocks();
  playMock = jest.fn().mockResolvedValue(undefined);
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
  global.Audio = jest.fn().mockImplementation(() => ({
    play: playMock, pause: jest.fn(), src: '', onended: null, onerror: null,
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
});
