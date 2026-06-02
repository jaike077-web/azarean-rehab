// =====================================================
// useAudioPreview — прослушка пресета звука (жест админа/инструктора).
//
// НЕ cue-путь раннера → new Audio() допустим (iOS-инвариант запрещает
// new Audio ТОЛЬКО в cue-инфраструктуре context/AudioContext.js).
//
// Удерживаем ссылку на Audio (нет GC-обрыва короткого клипа) + стоп
// предыдущего клипа при новом клике (один звук за раз, нет наложения) +
// revoke objectURL по завершении/ошибке/размонтированию (нет утечки).
//
// previewPreset(presetId): presetId == null → no-op («Стандартный тон» — нет файла).
// Единый источник для библиотеки пресетов, дом-карты и секции «Звуки комплекса».
// =====================================================

import { useRef, useEffect, useCallback } from 'react';
import { admin } from '../services/api';
import { useToast } from '../context/ToastContext';
import { getCueConfig } from '../pages/PatientDashboard/context/AudioContext';

// Громкость превью «Стандартного тона» = дефолт громкости пациента (0.6),
// чтобы админ слышал примерно как пациент. getCueConfig — тот же источник
// частот/длительностей, что у раннера → превью тона совпадает 1:1 (нет дрейфа).
const PREVIEW_TONE_VOLUME = 0.6;

export default function useAudioPreview() {
  const audioRef = useRef(null);
  const urlRef = useRef(null);
  // Монотонный токен поколения: stopCurrent() его бампит, и любой in-flight
  // previewPreset (ещё висящий на await до присвоения ref'ов) после загрузки
  // увидит расхождение и не заиграет — закрывает гонку двойного клика и
  // воспроизведение после размонтирования (refs ещё null → stopCurrent не помог бы).
  const genRef = useRef(0);
  const toneCtxRef = useRef(null); // AudioContext синтеза «Стандартного тона»
  const toast = useToast();

  const stopCurrent = useCallback(() => {
    genRef.current += 1;
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ''; } catch (_) { /* ignore */ }
      audioRef.current = null;
    }
    if (urlRef.current) {
      try { URL.revokeObjectURL(urlRef.current); } catch (_) { /* ignore */ }
      urlRef.current = null;
    }
    if (toneCtxRef.current) {
      try { if (toneCtxRef.current.close) toneCtxRef.current.close(); } catch (_) { /* ignore */ }
      toneCtxRef.current = null;
    }
  }, []);

  // Синтез «Стандартного тона» события (cueName) тем же кодом, что у раннера
  // (getCueConfig). Свежий AudioContext на жест → закрываем после тона.
  // CT4: toneConfigOverride (редактируемый тон из формы, уже clamped buildToneConfig)
  // перебивает дефолтные frequencies/durationMs/type → ▶ играет тон вживую как
  // будет сохранён. gain НЕ редактируем — берётся из getCueConfig (base).
  const playStandardTone = useCallback((cueName, toneConfigOverride) => {
    const base = getCueConfig(cueName);
    const ov = toneConfigOverride
      && Array.isArray(toneConfigOverride.frequencies) && toneConfigOverride.frequencies.length > 0
      ? toneConfigOverride : null;
    const cfg = ov
      ? { frequencies: ov.frequencies, durationMs: ov.durationMs, type: ov.type, gain: base ? base.gain : 0.3 }
      : base;
    if (!cfg) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    let ctx = null;
    try {
      ctx = new Ctor();
      toneCtxRef.current = ctx;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      const peak = PREVIEW_TONE_VOLUME * cfg.gain;
      const now = typeof ctx.currentTime === 'number' ? ctx.currentTime : 0;
      const perToneSec = cfg.durationMs / cfg.frequencies.length / 1000;
      cfg.frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = cfg.type;
        osc.frequency.value = freq;
        gain.gain.value = peak;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const start = now + i * perToneSec;
        osc.start(start);
        if (typeof osc.stop === 'function') osc.stop(start + perToneSec);
      });
      const ctxToClose = ctx;
      setTimeout(() => {
        if (toneCtxRef.current === ctxToClose) toneCtxRef.current = null;
        try { if (ctxToClose.close) ctxToClose.close(); } catch (_) { /* ignore */ }
      }, cfg.durationMs + 150);
    } catch {
      if (ctx) {
        if (toneCtxRef.current === ctx) toneCtxRef.current = null;
        try { if (ctx.close) ctx.close(); } catch (_) { /* ignore */ }
      }
    }
  }, []);

  // presetId — файл-пресет; presetId==null + cueName — «Стандартный тон» события.
  // toneConfigOverride (опц., CT4) — редактируемый тон для live-▶ дом-карты.
  const previewPreset = useCallback(async (presetId, cueName, toneConfigOverride) => {
    stopCurrent();
    if (presetId == null) {
      if (cueName) playStandardTone(cueName, toneConfigOverride);
      return;
    }
    const myGen = genRef.current; // поколение этого вызова (после bump в stopCurrent)
    let url = null;
    let audio = null;
    try {
      const res = await admin.fetchAudioPresetBlob(presetId);
      // Нас перебил более новый вызов или размонтирование (stopCurrent бампнул genRef),
      // пока шла загрузка — не создаём url/Audio и не играем (нет наложения и утечки).
      if (genRef.current !== myGen) return;
      url = URL.createObjectURL(res.data);
      urlRef.current = url;
      audio = new Audio(url);
      audioRef.current = audio;
      // revoke + сброс ссылок только если этот клип всё ещё текущий
      // (не перебит более новым вызовом previewPreset)
      const cleanup = () => {
        if (urlRef.current === url) {
          try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
          urlRef.current = null;
        }
        if (audioRef.current === audio) audioRef.current = null;
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch {
      if (url) { try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ } }
      if (urlRef.current === url) urlRef.current = null;
      if (audio && audioRef.current === audio) audioRef.current = null;
      toast.error('Не удалось воспроизвести');
    }
  }, [stopCurrent, playStandardTone, toast]);

  // Размонтирование (закрытие модалки / смена шага визарда) — гасим клип.
  useEffect(() => stopCurrent, [stopCurrent]);

  return previewPreset;
}
