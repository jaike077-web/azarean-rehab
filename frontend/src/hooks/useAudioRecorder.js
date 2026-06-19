// useAudioRecorder — запись микрофона в raw PCM 16-bit LE, 16 кГц моно.
//
// Зачем не MediaRecorder: Chrome отдаёт webm/opus, который Yandex SpeechKit НЕ принимает
// (нужен ogg/opus или lpcm). Пишем сырой PCM через AudioContext → SpeechKit format=lpcm.
// Работает кросс-браузерно, включая iOS Safari. ScriptProcessorNode формально deprecated,
// но поддержан везде и без отдельного worklet-файла (проще для CRA).

import { useRef, useState, useCallback, useEffect } from 'react';

const TARGET_RATE = 16000;

// Понижение частоты Float32 PCM (sourceRate → targetRate) усреднением окна.
function downsample(buffer, sourceRate, targetRate) {
  if (targetRate >= sourceRate) return buffer;
  const ratio = sourceRate / targetRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let offResult = 0;
  let offBuffer = 0;
  while (offResult < newLen) {
    const nextOff = Math.round((offResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offBuffer; i < nextOff && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offResult] = count ? accum / count : 0;
    offResult += 1;
    offBuffer = nextOff;
  }
  return result;
}

// Float32 [-1..1] → Int16 LE PCM → Blob.
function floatToPcm16Blob(float32) {
  const view = new DataView(new ArrayBuffer(float32.length * 2));
  for (let i = 0; i < float32.length; i += 1) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, s, true);
  }
  return new Blob([view], { type: 'audio/l16' });
}

export default function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState(null);

  const ctxRef = useRef(null);
  const streamRef = useRef(null);
  const procRef = useRef(null);
  const sourceRef = useRef(null);
  const chunksRef = useRef([]);
  const sourceRateRef = useRef(TARGET_RATE);
  const pausedRef = useRef(false);
  const timerRef = useRef(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { if (procRef.current) procRef.current.disconnect(); } catch (_) { /* noop */ }
    try { if (sourceRef.current) sourceRef.current.disconnect(); } catch (_) { /* noop */ }
    try { if (ctxRef.current && ctxRef.current.state !== 'closed') ctxRef.current.close(); } catch (_) { /* noop */ }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    procRef.current = null;
    sourceRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    pausedRef.current = false;
    setPaused(false);
    setElapsedSec(0);
    chunksRef.current = [];
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Микрофон недоступен (нужен https или localhost)');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      ctxRef.current = ctx;
      sourceRateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      proc.onaudioprocess = (e) => {
        if (pausedRef.current) return; // на паузе звук не копим (тишина-обдумывание отбрасывается)
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(proc);
      proc.connect(ctx.destination); // нужно для срабатывания onaudioprocess; вывод тихий
      setRecording(true);
      // Таймер реально записанного времени (на паузе не тикает).
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (!pausedRef.current) setElapsedSec((sec) => sec + 1);
      }, 1000);
    } catch (err) {
      setError(err && err.name === 'NotAllowedError' ? 'Нет доступа к микрофону' : 'Не удалось включить запись');
      cleanup();
    }
  }, [cleanup]);

  // Пауза/продолжение в рамках одной записи (сессия и поток с микрофона живут).
  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
  }, []);

  // Остановить и вернуть { blob, sampleRateHertz } (или null, если тишина).
  const stop = useCallback(async () => {
    setRecording(false);
    setPaused(false);
    pausedRef.current = false;
    const sourceRate = sourceRateRef.current;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    cleanup();

    let total = 0;
    chunks.forEach((c) => { total += c.length; });
    if (!total) return null;
    const merged = new Float32Array(total);
    let off = 0;
    chunks.forEach((c) => { merged.set(c, off); off += c.length; });

    const down = downsample(merged, sourceRate, TARGET_RATE);
    return { blob: floatToPcm16Blob(down), sampleRateHertz: TARGET_RATE };
  }, [cleanup]);

  // Подчистка при размонтировании владельца хука (закрытие модалки во время записи):
  // останавливает поток с микрофона и закрывает AudioContext, чтобы не висел захват.
  // cleanup стабилен (useCallback []) → эффект отрабатывает только на unmount.
  useEffect(() => cleanup, [cleanup]);

  return { recording, paused, elapsedSec, error, start, pause, resume, stop, cleanup };
}
