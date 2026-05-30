// =====================================================
// TEST: utils/audioFile — magic-byte детект + cue whitelist (CA2)
// Чистые функции (Rule #37), без HTTP/БД.
// =====================================================

const {
  AUDIO_CUE_NAMES,
  AUDIO_TYPE_META,
  detectAudioType,
  isValidCueName,
} = require('../../utils/audioFile');

const pad = (head) => Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);

describe('detectAudioType — magic bytes', () => {
  it('MP3 с ID3v2 тегом → mp3', () => {
    expect(detectAudioType(pad([0x49, 0x44, 0x33, 0x04, 0x00]))).toBe('mp3'); // 'ID3'
  });

  it('MP3 frame-sync FF FB → mp3', () => {
    expect(detectAudioType(pad([0xff, 0xfb, 0x90, 0x00]))).toBe('mp3');
  });

  it('MP3 frame-sync FF F3 → mp3', () => {
    expect(detectAudioType(pad([0xff, 0xf3, 0x00, 0x00]))).toBe('mp3');
  });

  it('WAV RIFF....WAVE → wav', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE'),
      Buffer.alloc(8),
    ]);
    expect(detectAudioType(buf)).toBe('wav');
  });

  it('RIFF без WAVE (например AVI) → null', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('AVI '),
      Buffer.alloc(8),
    ]);
    expect(detectAudioType(buf)).toBeNull();
  });

  it('произвольный текст (не аудио) → null', () => {
    expect(detectAudioType(Buffer.from('this is plain text not audio'))).toBeNull();
  });

  it('слишком короткий буфер (<12 байт) → null', () => {
    expect(detectAudioType(Buffer.from([0xff, 0xfb]))).toBeNull();
  });

  it('не-Buffer вход → null', () => {
    expect(detectAudioType('ID3 string')).toBeNull();
    expect(detectAudioType(null)).toBeNull();
    expect(detectAudioType(undefined)).toBeNull();
  });
});

describe('isValidCueName — whitelist', () => {
  it.each(AUDIO_CUE_NAMES)('валидный cue %s → true', (name) => {
    expect(isValidCueName(name)).toBe(true);
  });

  it('содержит ровно 5 cue\'ов CP1 (зеркало CHECK миграции)', () => {
    expect(AUDIO_CUE_NAMES).toEqual([
      'count_tick', 'set_start', 'set_end', 'rest_end', 'tempo_tick',
    ]);
  });

  it('чужой cue → false', () => {
    expect(isValidCueName('bad_cue')).toBe(false);
    expect(isValidCueName('')).toBe(false);
    expect(isValidCueName(undefined)).toBe(false);
    expect(isValidCueName(null)).toBe(false);
  });
});

describe('AUDIO_TYPE_META — канонические mime/ext', () => {
  it('mp3 → audio/mpeg / mp3', () => {
    expect(AUDIO_TYPE_META.mp3).toEqual({ mime: 'audio/mpeg', ext: 'mp3' });
  });
  it('wav → audio/wav / wav', () => {
    expect(AUDIO_TYPE_META.wav).toEqual({ mime: 'audio/wav', ext: 'wav' });
  });
});
