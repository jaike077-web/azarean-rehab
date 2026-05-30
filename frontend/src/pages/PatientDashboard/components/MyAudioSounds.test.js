// =====================================================
// TEST: MyAudioSounds (CA3) — секция «Мои звуки»
// Рендер внутри реального AudioProvider (useAudioOverrides/useAudioCue),
// api + toast + validateAudioFile замоканы. validateAudioFile-мок убирает
// зависимость от реального <audio>-probe (его pure-логика — в своём тесте).
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MyAudioSounds from './MyAudioSounds';
import { AudioProvider } from '../context/AudioContext';

jest.mock('../../../services/api', () => ({
  patientAuth: {
    listSounds: jest.fn(),
    uploadSound: jest.fn(),
    deleteSound: jest.fn(),
    fetchSoundBlob: jest.fn(),
  },
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('../../../context/ToastContext', () => ({
  useToast: () => mockToast,
}));

jest.mock('../utils/validateAudioFile', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve({ ok: true })),
}));

const { patientAuth } = require('../../../services/api');
const validateAudioFile = require('../utils/validateAudioFile').default;

const renderComp = () => render(
  <AudioProvider>
    <MyAudioSounds />
  </AudioProvider>,
);

const mp3File = () => new File([new Uint8Array([0xff, 0xfb, 0x90, 0x00])], 'beep.mp3', { type: 'audio/mpeg' });

beforeEach(() => {
  jest.clearAllMocks();
  patientAuth.listSounds.mockResolvedValue({ data: [] });
  patientAuth.uploadSound.mockResolvedValue({ data: {} });
  patientAuth.deleteSound.mockResolvedValue({ data: null });
  patientAuth.fetchSoundBlob.mockResolvedValue({ data: new Blob(['x'], { type: 'audio/mpeg' }) });
  validateAudioFile.mockResolvedValue({ ok: true });
});

describe('MyAudioSounds — рендер', () => {
  it('4 строки cue с RU-лейблами, статус «стандартный тон» по умолчанию', async () => {
    renderComp();
    expect(screen.getByText('Тики 3-2-1')).toBeInTheDocument();
    expect(screen.getByText('Старт подхода')).toBeInTheDocument();
    expect(screen.getByText('Конец подхода')).toBeInTheDocument();
    expect(screen.getByText('Конец отдыха')).toBeInTheDocument();
    ['count_tick', 'set_start', 'set_end', 'rest_end'].forEach((c) => {
      expect(screen.getByTestId(`audio-row-${c}`)).toBeInTheDocument();
      expect(screen.getByTestId(`audio-state-${c}`)).toHaveTextContent('стандартный тон');
    });
    // tempo_tick в UI НЕ показан (decision #7).
    expect(screen.queryByTestId('audio-row-tempo_tick')).not.toBeInTheDocument();
    // Список тянется на mount.
    await waitFor(() => expect(patientAuth.listSounds).toHaveBeenCalled());
  });

  it('cue со своим звуком → имя файла + кнопка сброса', async () => {
    patientAuth.listSounds.mockResolvedValue({
      data: [{ cue_name: 'set_end', original_filename: 'voice.mp3', mime_type: 'audio/mpeg', size_bytes: 8000, uploaded_at: '2026-05-30T10:00:00Z' }],
    });
    renderComp();
    expect(await screen.findByText('voice.mp3')).toBeInTheDocument();
    expect(screen.getByTestId('audio-clear-set_end')).toBeInTheDocument();
    // У остальных cue сброса нет.
    expect(screen.queryByTestId('audio-clear-count_tick')).not.toBeInTheDocument();
  });
});

describe('MyAudioSounds — upload', () => {
  it('валидный файл → uploadSound(FormData) + рефреш списка + success-toast', async () => {
    renderComp();
    await waitFor(() => expect(patientAuth.listSounds).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('audio-input-set_end'), { target: { files: [mp3File()] } });

    await waitFor(() => expect(patientAuth.uploadSound).toHaveBeenCalledTimes(1));
    const fd = patientAuth.uploadSound.mock.calls[0][0];
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('cue_name')).toBe('set_end');
    expect(fd.get('file')).toBeTruthy();
    // Рефреш после загрузки (listSounds второй раз).
    await waitFor(() => expect(patientAuth.listSounds).toHaveBeenCalledTimes(2));
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('невалидный файл → toast.error, uploadSound НЕ вызван', async () => {
    validateAudioFile.mockResolvedValue({ ok: false, error: 'Звук длиннее 5 секунд' });
    renderComp();
    await waitFor(() => expect(patientAuth.listSounds).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId('audio-input-count_tick'), { target: { files: [mp3File()] } });

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Не подходит', 'Звук длиннее 5 секунд'));
    expect(patientAuth.uploadSound).not.toHaveBeenCalled();
  });
});

describe('MyAudioSounds — clear', () => {
  it('сброс → deleteSound(cue) + рефреш списка', async () => {
    patientAuth.listSounds.mockResolvedValue({
      data: [{ cue_name: 'rest_end', original_filename: 'r.wav', mime_type: 'audio/wav', size_bytes: 9000, uploaded_at: '2026-05-30T10:00:00Z' }],
    });
    renderComp();
    const clearBtn = await screen.findByTestId('audio-clear-rest_end');

    fireEvent.click(clearBtn);

    await waitFor(() => expect(patientAuth.deleteSound).toHaveBeenCalledWith('rest_end'));
    // Рефреш после удаления (listSounds: mount + после delete).
    await waitFor(() => expect(patientAuth.listSounds).toHaveBeenCalledTimes(2));
    expect(mockToast.success).toHaveBeenCalled();
  });
});
