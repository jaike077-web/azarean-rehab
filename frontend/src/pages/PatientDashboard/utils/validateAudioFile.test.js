// =====================================================
// TEST: validateAudioFile (CA3) — чистая функция (Rule #37)
// probeDuration инъектируется → детерминированно, без реального <audio>.
// =====================================================

import validateAudioFile, {
  checkAudioBasics,
  MAX_AUDIO_BYTES,
} from './validateAudioFile';

const f = (over = {}) => ({ name: 'beep.mp3', type: 'audio/mpeg', size: 1000, ...over });
const probe = (sec) => () => Promise.resolve(sec);
const probeFail = () => () => Promise.reject(new Error('nope'));

describe('checkAudioBasics — синхронные проверки', () => {
  it('валидный mp3 → ok', () => {
    expect(checkAudioBasics(f())).toEqual({ ok: true });
  });
  it('валидный wav → ok', () => {
    expect(checkAudioBasics(f({ name: 'r.wav', type: 'audio/wav' }))).toEqual({ ok: true });
  });
  it('нет файла → ошибка', () => {
    expect(checkAudioBasics(null).ok).toBe(false);
  });
  it('чужое расширение → ошибка формата', () => {
    expect(checkAudioBasics(f({ name: 'x.txt', type: 'text/plain' }))).toEqual({
      ok: false, error: 'Только MP3 или WAV',
    });
  });
  it('чужой mime (даже если ext ok) → ошибка формата', () => {
    expect(checkAudioBasics(f({ name: 'x.mp3', type: 'application/pdf' })).ok).toBe(false);
  });
  it('> 512 КБ → ошибка размера', () => {
    expect(checkAudioBasics(f({ size: MAX_AUDIO_BYTES + 1 }))).toEqual({
      ok: false, error: 'Файл больше 512 КБ',
    });
  });
});

describe('validateAudioFile — async с probe', () => {
  it('валидный + длительность 3с → ok', async () => {
    await expect(validateAudioFile(f(), probe(3))).resolves.toEqual({ ok: true });
  });

  it('> 512 КБ → ошибка ДО probe (probe не вызывается)', async () => {
    const spy = jest.fn(() => Promise.resolve(1));
    const res = await validateAudioFile(f({ size: MAX_AUDIO_BYTES + 100 }), spy);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/512/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('не тот формат → ошибка ДО probe', async () => {
    const res = await validateAudioFile(f({ name: 'x.ogg', type: 'audio/ogg' }), probe(1));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/MP3 или WAV/);
  });

  it('длительность 11с (> 10) → ошибка длительности', async () => {
    await expect(validateAudioFile(f(), probe(11))).resolves.toEqual({
      ok: false, error: 'Звук длиннее 10 секунд',
    });
  });

  it('ровно 10с → ok (граница)', async () => {
    await expect(validateAudioFile(f(), probe(10))).resolves.toEqual({ ok: true });
  });

  it('7с (бывшая граница 5) → теперь ok', async () => {
    await expect(validateAudioFile(f(), probe(7))).resolves.toEqual({ ok: true });
  });

  it('probe упал (не измерили) → ok (best-effort, бэкстоп — размер на сервере)', async () => {
    await expect(validateAudioFile(f(), probeFail())).resolves.toEqual({ ok: true });
  });
});
